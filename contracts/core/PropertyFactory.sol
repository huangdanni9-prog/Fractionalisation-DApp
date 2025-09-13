// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PropertyRegistry} from "./PropertyRegistry.sol";
import {FractionalToken} from "../tokens/FractionalToken.sol";

/// @title PropertyFactory
/// @notice Users submit property listing applications with metadata and economic params.
/// Admin reviews and approves/rejects (with reason). Once approved, the applicant calls
/// finalize to deploy the token, mint total supply to themselves (owner), and create the
/// registry entry. Images and details live in metadataURI (IPFS recommended).
contract PropertyFactory is Ownable, ReentrancyGuard {
    enum Status { Pending, Approved, Rejected, Finalized }

    struct Application {
        address applicant; // wallet who submitted and will own the property tokens
        string name;       // token name (e.g., "Damansara Villa Shares")
        string symbol;     // token symbol (e.g., "DMSR")
        string metadataURI; // property metadata (IPFS or data:)
        uint256 totalShares;
        uint256 sharePriceWei; // primary price per share
        Status status;
        string reviewNote; // optional reason for rejection or note
        uint256 createdAt;
        uint256 decidedAt;
        uint256 propertyId; // set after finalize
        address token;      // set after finalize
    }

    PropertyRegistry public immutable registry;

    // Global application storage
    uint256 public nextAppId;
    mapping(uint256 => Application) public applications; // appId => application
    // Per-applicant index for history
    mapping(address => uint256[]) private userApps; // applicant => appIds (append-only)

    event ApplicationSubmitted(uint256 indexed appId, address indexed applicant, string name, string symbol);
    event ApplicationReviewed(uint256 indexed appId, Status status, string note);
    event ApplicationFinalized(uint256 indexed appId, uint256 indexed propertyId, address token);

    constructor(address initialOwner, PropertyRegistry _registry) Ownable(initialOwner) {
        registry = _registry;
    }

    // -------- User flow --------
    function submitApplication(
        string calldata name_,
        string calldata symbol_,
        string calldata metadataURI,
        uint256 totalShares,
        uint256 sharePriceWei
    ) external returns (uint256 appId) {
        require(bytes(name_).length > 0 && bytes(symbol_).length > 0, "INVALID_NAME");
        require(totalShares > 0, "INVALID_SHARES");
        appId = ++nextAppId; // start at 1
        applications[appId] = Application({
            applicant: msg.sender,
            name: name_,
            symbol: symbol_,
            metadataURI: metadataURI,
            totalShares: totalShares,
            sharePriceWei: sharePriceWei,
            status: Status.Pending,
            reviewNote: "",
            createdAt: block.timestamp,
            decidedAt: 0,
            propertyId: 0,
            token: address(0)
        });
        userApps[msg.sender].push(appId);
        emit ApplicationSubmitted(appId, msg.sender, name_, symbol_);
    }

    function getMyApplications(address account) external view returns (Application[] memory items, uint256[] memory ids) {
        uint256[] memory idx = userApps[account];
        items = new Application[](idx.length);
        ids = new uint256[](idx.length);
        for (uint256 i = 0; i < idx.length; i++) {
            items[i] = applications[idx[i]];
            ids[i] = idx[i];
        }
    }

    // -------- Admin review --------
    function reviewApplication(uint256 appId, bool approve, string calldata note) external onlyOwner {
        Application storage a = applications[appId];
        require(a.applicant != address(0), "NO_APP");
        require(a.status == Status.Pending, "NOT_PENDING");
        a.status = approve ? Status.Approved : Status.Rejected;
        a.reviewNote = note;
        a.decidedAt = block.timestamp;
        emit ApplicationReviewed(appId, a.status, note);
    }

    // -------- Applicant finalization --------
    /// @notice After admin approval, the applicant calls finalize to deploy token and create the property.
    /// Requires this factory to be authorized in the Registry (setAuthorizedCreator=true).
    function finalizeApprovedApplication(uint256 appId) external nonReentrant returns (uint256 propertyId, address token) {
        Application storage a = applications[appId];
        require(a.applicant != address(0), "NO_APP");
        require(a.status == Status.Approved, "NOT_APPROVED");
        require(msg.sender == a.applicant, "NOT_APPLICANT");
        // Deploy ERC20 and mint total to applicant (owner of tokens)
        FractionalToken ft = new FractionalToken(a.name, a.symbol, address(this));
        ft.mint(a.applicant, a.totalShares);
        // Create registry record (requires factory to be authorized creator)
        propertyId = registry.createProperty(a.metadataURI, address(ft), a.totalShares, a.sharePriceWei, a.applicant);
        token = address(ft);
        a.status = Status.Finalized;
        a.propertyId = propertyId;
        a.token = token;
        emit ApplicationFinalized(appId, propertyId, token);
    }

    // -------- Admin views --------
    function getApplications(uint256 start, uint256 count) external view returns (Application[] memory items, uint256[] memory ids, uint256 total) {
        // Simple linear scan; in production consider indexing by arrays; here nextAppId is a counter.
        total = nextAppId;
        uint256 end = start + count;
        if (end > total) end = total;
        uint256 n = end > start ? end - start : 0;
        items = new Application[](n);
        ids = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            uint256 appId = start + 1 + i; // appIds start at 1
            items[i] = applications[appId];
            ids[i] = appId;
        }
    }
}
