// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title SoulboundNFT
 * @dev Non-transferable NFT (Soulbound) implementation
 * @notice Once minted, tokens cannot be transferred to another address
 */
contract SoulboundNFT is ERC721, ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    
    Counters.Counter private _tokenIds;
    
    // Mapping to track if an address has already minted
    mapping(address => bool) private _hasMinted;
    
    // Mapping to store custom attributes
    mapping(uint256 => string) private _customAttributes;
    
    // Events
    event SoulboundMinted(address indexed to, uint256 indexed tokenId, string tokenURI);
    event MintingRevoked(address indexed user);
    
    /**
     * @dev Constructor sets the name and symbol of the NFT
     */
    constructor() ERC721("SoulboundBadge", "SBT") Ownable(msg.sender) {}
    
    /**
     * @dev Override all transfer functions to make it soulbound
     */
    function transferFrom(address, address, uint256) public pure override {
        revert("Soulbound: Non-transferable");
    }
    
    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        revert("Soulbound: Non-transferable");
    }
    
    function safeTransferFrom(address, address, uint256) public pure override {
        revert("Soulbound: Non-transferable");
    }
    
    /**
     * @dev Override approval functions to prevent approvals
     */
    function approve(address, uint256) public pure override {
        revert("Soulbound: Approvals not allowed");
    }
    
    function setApprovalForAll(address, bool) public pure override {
        revert("Soulbound: Approvals not allowed");
    }
    
    function getApproved(uint256) public pure override returns (address) {
        return address(0);
    }
    
    function isApprovedForAll(address, address) public pure override returns (bool) {
        return false;
    }
    
    /**
     * @dev Mint a new soulbound NFT
     * @param to Address to receive the NFT
     * @param tokenURI URI pointing to the metadata
     * @param attributes Custom attributes (optional)
     * @return tokenId The minted token ID
     */
    function mint(
        address to, 
        string memory tokenURI,
        string memory attributes
    ) public onlyOwner returns (uint256) {
        require(to != address(0), "Soulbound: Cannot mint to zero address");
        require(!_hasMinted[to], "Soulbound: Address already has a badge");
        
        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();
        
        _safeMint(to, newTokenId);
        _setTokenURI(newTokenId, tokenURI);
        _customAttributes[newTokenId] = attributes;
        _hasMinted[to] = true;
        
        emit SoulboundMinted(to, newTokenId, tokenURI);
        
        return newTokenId;
    }
    
    /**
     * @dev Batch mint multiple NFTs (for gas efficiency)
     */
    function batchMint(
        address[] calldata recipients,
        string[] calldata tokenURIs,
        string[] calldata attributes
    ) external onlyOwner returns (uint256[] memory) {
        require(
            recipients.length == tokenURIs.length && 
            tokenURIs.length == attributes.length,
            "Soulbound: Array lengths mismatch"
        );
        
        uint256[] memory tokenIds = new uint256[](recipients.length);
        
        for (uint256 i = 0; i < recipients.length; i++) {
            require(!_hasMinted[recipients[i]], "Soulbound: Address already has badge");
            
            _tokenIds.increment();
            uint256 newTokenId = _tokenIds.current();
            
            _safeMint(recipients[i], newTokenId);
            _setTokenURI(newTokenId, tokenURIs[i]);
            _customAttributes[newTokenId] = attributes[i];
            _hasMinted[recipients[i]] = true;
            
            tokenIds[i] = newTokenId;
            emit SoulboundMinted(recipients[i], newTokenId, tokenURIs[i]);
        }
        
        return tokenIds;
    }
    
    /**
     * @dev Check if an address has already minted
     */
    function hasMinted(address user) external view returns (bool) {
        return _hasMinted[user];
    }
    
    /**
     * @dev Get custom attributes for a token
     */
    function getAttributes(uint256 tokenId) external view returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Soulbound: Token doesn't exist");
        return _customAttributes[tokenId];
    }
    
    /**
     * @dev Get total supply of minted tokens
     */
    function totalSupply() external view returns (uint256) {
        return _tokenIds.current();
    }
    
    /**
     * @dev Revoke minting ability for an address (emergency only)
     */
    function revokeMinting(address user) external onlyOwner {
        _hasMinted[user] = true; // Set to true to prevent future mints
        emit MintingRevoked(user);
    }
    
    /**
     * @dev Override required by Solidity
     */
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }
    
    /**
     * @dev Override required by Solidity
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}