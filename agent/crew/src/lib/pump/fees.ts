import { PublicKey, Transaction } from '@solana/web3.js'
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { feeSharingConfigPda } from '@pump-fun/pump-sdk'
import type { WalletContextState } from '@solana/wallet-adapter-react'
import { getConnection, getPumpSdk } from './connection'

export async function distributeCreatorFees(mintStr: string, wallet: WalletContextState) {
  if (!wallet.publicKey || !wallet.sendTransaction) {
    throw new Error('Connect a wallet to crank remits.')
  }

  const mint = new PublicKey(mintStr)
  const sdk = getPumpSdk()
  const connection = getConnection()
  const sharingConfigAddress = feeSharingConfigPda(mint)
  const accountInfo = await connection.getAccountInfo(sharingConfigAddress)
  if (!accountInfo) {
    throw new Error('No fee-sharing config on this mint yet.')
  }
  const sharingConfig = sdk.decodeSharingConfig(accountInfo)

  const ix = await sdk.distributeCreatorFeesV2({
    mint,
    sharingConfig,
    sharingConfigAddress,
    quoteMint: NATIVE_MINT,
    payer: wallet.publicKey,
    shouldInitializeAta: true,
    quoteTokenProgram: TOKEN_PROGRAM_ID,
  })

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  const tx = new Transaction({
    feePayer: wallet.publicKey,
    blockhash,
    lastValidBlockHeight,
  }).add(ix)

  const signature = await wallet.sendTransaction(tx, connection)
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed')
  return signature
}
