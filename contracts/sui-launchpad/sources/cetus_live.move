/// Live Cetus testnet deployment ids (matches Move.lock pin → package origin 0x5372…).
module crewpay_launchpad::cetus_live;

/// Cetus CLMM package origin on testnet (see `sui move build` dependency module ids).
public fun package_id(): address {
    @0x5372d555ac734e272659136c2a0cd3227f9b92de67c80dc11250307268af2db8
}

/// Shared `GlobalConfig` for the 0x5372… deployment (GitBook / e2e defaults).
public fun global_config_id(): address {
    @0xc6273f844b4bc258952c4e477697aa12c918c8e08106fac6b934811298c9820a
}

/// Shared `Pools` for the 0x5372… deployment.
public fun pools_id(): address {
    @0x20a086e6fa0741b3ca77d033a65faf0871349b986ddbdde6fa1d85d78a5f4222
}

/// SDK-aligned deployment (`@cetusprotocol/cetus-sui-clmm-sdk` testnet `clmm_pool.published_at`).
public fun sdk_clmm_published_at(): address {
    @0x85e61285a10efc6602ab00df70a0c06357c384ef4c5633ecf73016df1500c704
}

public fun sdk_global_config_id(): address {
    @0x9774e359588ead122af1c7e7f64e14ade261cfeecdb5d0eb4a5b3b4c8ab8bd3e
}

public fun sdk_pools_id(): address {
    @0x50eb61dd5928cec5ea04711a2e9b72e5237e79e9fbcd2ce3d5469dc8708e0ee2
}
