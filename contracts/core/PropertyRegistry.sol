// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IFractionalTokenReadonly {
    function totalSupply() external view returns (uint256);
}

contract PropertyRegistry is Ownable {
    struct Property {
        // Off-chain metadata URI (IPFS/HTTP) for property details
        string metadataURI;
        // Fractional token address representing shares of this property
        address fractionalToken;
        // Total shares minted
        uint256 totalShares;
        // Price per share in wei (for primary sales)
        uint256 sharePriceWei;
        // Owner of the underlying property (initial recipient of shares)
        address propertyOwner;
        // Active flag
        bool active;
    }

    uint256 public nextPropertyId;
    mapping(uint256 => Property) public properties; // propertyId => Property

    event PropertyCreated(uint256 indexed propertyId, address indexed token, uint256 totalShares, uint256 sharePriceWei, address owner, string metadataURI);
    event PropertyStatusChanged(uint256 indexed propertyId, bool active);
    event PropertyMetadataUpdated(uint256 indexed propertyId, string metadataURI);
    event PropertySharePriceUpdated(uint256 indexed propertyId, uint256 sharePriceWei);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function createProperty(
        string memory metadataURI,
        address fractionalToken,
        uint256 totalShares,
        uint256 sharePriceWei,
        address propertyOwner
    ) external onlyOwner returns (uint256 propertyId) {
        require(fractionalToken != address(0), "INVALID_TOKEN");
        propertyId = nextPropertyId;
        properties[propertyId] = Property({
            metadataURI: metadataURI,
            fractionalToken: fractionalToken,
            totalShares: totalShares,
            sharePriceWei: sharePriceWei,
            propertyOwner: propertyOwner,
            active: true
        });
        nextPropertyId = propertyId + 1;
        emit PropertyCreated(propertyId, fractionalToken, totalShares, sharePriceWei, propertyOwner, metadataURI);
    }

    function setPropertyActive(uint256 propertyId, bool active) external onlyOwner {
        require(properties[propertyId].fractionalToken != address(0), "NO_PROPERTY");
        properties[propertyId].active = active;
        emit PropertyStatusChanged(propertyId, active);
    }

    function updatePropertyMetadataURI(uint256 propertyId, string calldata metadataURI) external onlyOwner {
        require(properties[propertyId].fractionalToken != address(0), "NO_PROPERTY");
        properties[propertyId].metadataURI = metadataURI;
        emit PropertyMetadataUpdated(propertyId, metadataURI);
    }

    function updatePropertySharePrice(uint256 propertyId, uint256 sharePriceWei) external onlyOwner {
        require(properties[propertyId].fractionalToken != address(0), "NO_PROPERTY");
        properties[propertyId].sharePriceWei = sharePriceWei;
        emit PropertySharePriceUpdated(propertyId, sharePriceWei);
    }

    function getProperty(uint256 propertyId) external view returns (Property memory) {
        return properties[propertyId];
    }

    function getAllProperties(uint256 start, uint256 count) external view returns (Property[] memory items) {
        uint256 end = start + count;
        if (end > nextPropertyId) end = nextPropertyId;
        uint256 n = end > start ? end - start : 0;
        items = new Property[](n);
        for (uint256 i = 0; i < n; i++) {
            items[i] = properties[start + i];
        }
    }
}
