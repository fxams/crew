import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit'
import { shortAddress } from '../../lib/sui-format'

export function SuiWalletButton() {
  const account = useCurrentAccount()
  return (
    <div className="sui-wallet-row">
      {account ? (
        <span className="sui-wallet-addr mono">{shortAddress(account.address, 6)}</span>
      ) : null}
      <ConnectButton className="btn btn-secondary btn-sui-connect" />
    </div>
  )
}
