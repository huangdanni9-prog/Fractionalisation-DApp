// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PropertyRegistry} from "./PropertyRegistry.sol";
import {FractionalToken} from "../tokens/FractionalToken.sol";

contract Marketplace is Ownable, ReentrancyGuard {
    PropertyRegistry public immutable registry;

    struct Listing {
        // secondary-market listing per seller per property
        uint256 propertyId;
        address seller;
        uint256 amount; // shares
        uint256 pricePerShareWei; // secondary price
        bool active;
    }

    // Dividend accounting (per property)
    uint256 private constant PRECISION = 1e18;
    mapping(uint256 => uint256) public accDivPerShare; // scaled by 1e18
    mapping(uint256 => mapping(address => int256)) public divCorrections; // per property per account
    mapping(uint256 => mapping(address => uint256)) public withdrawnDividends; // cumulative claimed

    // Simplified listing book
    uint256 public nextListingId;
    mapping(uint256 => Listing) public listings;

    // Total secondary-market listed shares per property (currently available for purchase)
    mapping(uint256 => uint256) public activeListedSupply;

    event SharesPurchased(uint256 indexed propertyId, address indexed buyer, uint256 amount, uint256 pricePerShareWei);
    event SharesSold(uint256 indexed propertyId, address indexed seller, uint256 amount, uint256 pricePerShareWei, uint256 listingId);
    event ListingCreated(uint256 indexed listingId, uint256 indexed propertyId, address indexed seller, uint256 amount, uint256 pricePerShareWei);
    event ListingFilled(uint256 indexed listingId, address indexed buyer, uint256 amount);
    event ListingCancelled(uint256 indexed listingId);
    event DividendsDeposited(uint256 indexed propertyId, uint256 amount);
    event DividendClaimed(uint256 indexed propertyId, address indexed account, uint256 amount);
    event PropertyCreated(uint256 indexed propertyId, address token, uint256 totalShares, uint256 sharePriceWei, address owner, string metadataURI);

    constructor(address initialOwner, PropertyRegistry _registry) Ownable(initialOwner) {
        registry = _registry;
    }

    // Create property and fractional token, mint all to propertyOwner
    function createProperty(
        string memory name_,
        string memory symbol_,
        string memory metadataURI,
        uint256 totalShares,
        uint256 sharePriceWei,
        address propertyOwner
    ) external onlyOwner returns (uint256 propertyId, address token) {
        require(totalShares > 0, "INVALID_SHARES");
        require(propertyOwner != address(0), "INVALID_OWNER");

        // Deploy a new ERC20 token for this property
        FractionalToken ft = new FractionalToken(name_, symbol_, address(this));
    // Mint initial supply to the property owner so primary sales and dividends work
    ft.mint(propertyOwner, totalShares);
    // Register the property in the registry
    propertyId = registry.createProperty(metadataURI, address(ft), totalShares, sharePriceWei, propertyOwner);
    emit PropertyCreated(propertyId, address(ft), totalShares, sharePriceWei, propertyOwner, metadataURI);
    return (propertyId, address(ft));
    }

    // Primary sale: reduce owner's balance and deliver to buyer (no inflation). Payment forwarded to propertyOwner.
    function buyShares(uint256 propertyId, address token, uint256 amount, uint256 pricePerShareWei) external payable nonReentrant {
        require(amount > 0, "INVALID_AMOUNT");
        require(msg.value == amount * pricePerShareWei, "INVALID_ETH");
        FractionalToken ft = FractionalToken(token);
        PropertyRegistry.Property memory prop = registry.getProperty(propertyId);
        require(prop.fractionalToken == token, "INVALID_TOKEN");
        // Ensure enough available shares with the property owner
        require(ft.balanceOf(prop.propertyOwner) >= amount, "INSUFFICIENT_AVAILABLE");
        // Adjust dividend corrections prior to balance changes using current acc
        uint256 acc = accDivPerShare[propertyId];
        if (acc > 0) {
            // Seller loses shares
            divCorrections[propertyId][prop.propertyOwner] += int256((acc * amount) / PRECISION);
            // Buyer gains shares
            divCorrections[propertyId][msg.sender] -= int256((acc * amount) / PRECISION);
        }
        // Move shares: burn from owner, mint to buyer (escrowless transfer using owner-only controls)
        ft.burn(prop.propertyOwner, amount);
        ft.mint(msg.sender, amount);
        // Forward payment to property owner
        (bool ok, ) = payable(prop.propertyOwner).call{value: msg.value}("");
        require(ok, "PAY_FAIL");
        emit SharesPurchased(propertyId, msg.sender, amount, pricePerShareWei);
    }

    // Secondary-market listing
    function createListing(address token, uint256 propertyId, uint256 amount, uint256 pricePerShareWei) external nonReentrant returns (uint256 listingId) {
        require(amount > 0, "INVALID_AMOUNT");
        FractionalToken ft = FractionalToken(token);
        require(ft.balanceOf(msg.sender) >= amount, "INSUFFICIENT");
        // escrow by burning from seller and re-minting to buyer on fill (simplified to avoid approvals)
        uint256 acc = accDivPerShare[propertyId];
        if (acc > 0) {
            // Seller moves shares into escrow
            divCorrections[propertyId][msg.sender] += int256((acc * amount) / PRECISION);
        }
        ft.burn(msg.sender, amount);
        listingId = ++nextListingId;
        listings[listingId] = Listing({ propertyId: propertyId, seller: msg.sender, amount: amount, pricePerShareWei: pricePerShareWei, active: true });
        // increase active listed supply for this property
        activeListedSupply[propertyId] += amount;
        emit ListingCreated(listingId, propertyId, msg.sender, amount, pricePerShareWei);
    }

    function cancelListing(address token, uint256 listingId) external nonReentrant {
        Listing storage l = listings[listingId];
        require(l.active, "NOT_ACTIVE");
        require(l.seller == msg.sender, "NOT_SELLER");
        l.active = false;
        // reduce active listed supply by remaining amount
        if (l.amount > 0) {
            activeListedSupply[l.propertyId] -= l.amount;
        }
        // return escrow
        uint256 acc = accDivPerShare[l.propertyId];
        if (acc > 0) {
            divCorrections[l.propertyId][msg.sender] -= int256((acc * l.amount) / PRECISION);
        }
        FractionalToken(token).mint(msg.sender, l.amount);
        emit ListingCancelled(listingId);
    }

    function fillListing(address token, uint256 listingId, uint256 amount) external payable nonReentrant {
        Listing storage l = listings[listingId];
        require(l.active, "NOT_ACTIVE");
        require(amount > 0 && amount <= l.amount, "INVALID_AMOUNT");
        require(msg.value == amount * l.pricePerShareWei, "INVALID_ETH");
        l.amount -= amount;
        // pay seller
        (bool ok, ) = l.seller.call{value: msg.value}("");
        require(ok, "PAY_FAIL");
        // deliver shares by minting to buyer (since escrow burned on list)
        uint256 acc = accDivPerShare[l.propertyId];
        if (acc > 0) {
            divCorrections[l.propertyId][msg.sender] -= int256((acc * amount) / PRECISION);
        }
        FractionalToken(token).mint(msg.sender, amount);
        // decrease active listed supply by filled amount
        activeListedSupply[l.propertyId] -= amount;
        emit ListingFilled(listingId, msg.sender, amount);
        if (l.amount == 0) {
            l.active = false;
        }
        emit SharesSold(l.propertyId, l.seller, amount, l.pricePerShareWei, listingId);
    }

    // Dividends
    function depositDividends(uint256 propertyId) external payable onlyOwner {
        require(msg.value > 0, "NO_VALUE");
        // Compute total supply via the property's token
        PropertyRegistry.Property memory prop = registry.getProperty(propertyId);
        require(prop.fractionalToken != address(0), "NO_TOKEN");
        uint256 supply = FractionalToken(prop.fractionalToken).totalSupply();
        require(supply > 0, "NO_SUPPLY");
        accDivPerShare[propertyId] += (msg.value * PRECISION) / supply;
        emit DividendsDeposited(propertyId, msg.value);
    }

    function pendingDividends(address token, uint256 propertyId, address account) public view returns (uint256) {
        FractionalToken ft = FractionalToken(token);
        uint256 bal = ft.balanceOf(account);
        int256 accum = int256((bal * accDivPerShare[propertyId]) / PRECISION);
        int256 corrected = accum + divCorrections[propertyId][account];
        if (corrected <= 0) return 0;
        uint256 credited = uint256(corrected);
        uint256 withdrawn = withdrawnDividends[propertyId][account];
        if (credited <= withdrawn) return 0;
        return credited - withdrawn;
    }

    function claimDividends(address token, uint256 propertyId) external nonReentrant {
        uint256 amount = pendingDividends(token, propertyId, msg.sender);
        require(amount > 0, "NO_PENDING");
        withdrawnDividends[propertyId][msg.sender] += amount;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "PAYOUT_FAIL");
        emit DividendClaimed(propertyId, msg.sender, amount);
    }

    // Admin updates (only Marketplace owner)
    function updatePropertyMetadataURI(uint256 propertyId, string calldata metadataURI) external onlyOwner {
        registry.updatePropertyMetadataURI(propertyId, metadataURI);
    }

    function updatePropertySharePrice(uint256 propertyId, uint256 sharePriceWei) external onlyOwner {
        registry.updatePropertySharePrice(propertyId, sharePriceWei);
    }

    // Admin: toggle property active flag in the registry
    function setPropertyActive(uint256 propertyId, bool active) external onlyOwner {
        registry.setPropertyActive(propertyId, active);
    }
}
