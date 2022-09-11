import { Network } from '@xchainjs/xchain-client'
import axios from 'axios'
import * as bitcoin from 'bitcoinjs-lib'
import { Amount, Asset } from '../../entities'
import { TxParams } from 'lib/types'
import { sochainBaseUrl } from '../constants'

import { IWalletProvider } from '../types'

export class LTCProvider implements IWalletProvider {
  public nativeAsset = Asset.DOGE()
  private DECIMAL = 8

  private address: string = ''
  private balance: Amount = Amount.fromBaseAmount(0, 8)

  private sochainNetwork: string
  private prefix: bitcoin.networks.Network

  private ecpair
  private compressed: boolean = false

  constructor(private privateKey: string, private network: Network) {
    this.sochainNetwork = network === 'testnet' ? 'LTCTEST' : 'LTC'
    this.prefix =
      network === 'testnet'
        ? {
            messagePrefix: '\x19Litecoin Signed Message:\n',
            bech32: 'tltc',
            bip32: {
              private: 0x0436ef7d,
              public: 0x0436f6e1,
            },
            pubKeyHash: 0x6f,
            scriptHash: 0xc4,
            wif: 0xef,
          }
        : {
            messagePrefix: '\x19Litecoin Signed Message:\n',
            bech32: 'ltc',
            bip32: {
              public: 0x019da462,
              private: 0x019d9cfe,
            },
            pubKeyHash: 0x30,
            scriptHash: 0x32,
            wif: 0xb0,
          }

    this.ecpair = bitcoin.ECPair.fromPrivateKey(
      Buffer.from(privateKey, 'hex'),
      {
        network: this.prefix,
      },
    )

    const { publicKey, compressed } = this.ecpair
    this.address =
      bitcoin.payments.p2wpkh({
        pubkey: publicKey,
        network: this.prefix,
      }).address ?? ''
    this.compressed = compressed
  }

  init = async () => {
    await this.updateBalance()
  }

  updateBalance = async () => {
    const res = await axios.get(
      `${sochainBaseUrl}/get_address_balance/${this.sochainNetwork}/${this.address}`,
    )
    this.balance = Amount.fromAssetAmount(
      Number(res.data.data.confirmed_balance),
      this.DECIMAL,
    )
  }

  getAddress = (): string => this.address
  getBalance = (): Amount => this.balance

  signTransaction = async (txParams: TxParams) => {
    try {
      const { to, memo, value } = txParams

      const baseValue = value.baseAmount.toNumber()
      const fee = Number(
        txParams.fee ??
          Amount.fromAssetAmount(0.92, this.DECIMAL).baseAmount.toNumber(),
      )

      const utxoData = (
        await axios.get(
          `${sochainBaseUrl}/get_tx_unspent/${this.sochainNetwork}/${this.address}`,
        )
      ).data.data.txs

      const psbt = new bitcoin.Psbt({ network: this.prefix })
      const utxos: any[] = []
      let totalInputValue = 0
      let i = 0
      while (totalInputValue < baseValue + fee) {
        if (!utxoData[i]) {
          throw Error('Not enough funds')
        }
        utxos.push(utxoData[i])
        totalInputValue += +utxoData[i].value * 100000000
        i++
      }

      await Promise.all(
        utxos.map(async (utxo) => {
          const txHash = (
            await axios.get(
              `${sochainBaseUrl}/get_tx/${this.sochainNetwork}/${utxo.txid}`,
            )
          ).data.data.tx_hex
          psbt.addInput({
            hash: utxo.txid,
            index: utxo.output_no,
            nonWitnessUtxo: Buffer.from(txHash, 'hex'),
          })
        }),
      )

      psbt.addOutput({
        address: to,
        value: baseValue,
      })

      if (totalInputValue - baseValue - fee !== 0) {
        psbt.addOutput({
          address: this.address,
          value: totalInputValue - baseValue - fee,
        })
      }

      if (memo) {
        const data = Buffer.from(memo, 'utf8')
        psbt.addOutput({
          value: 0,
          script: bitcoin.script.compile([bitcoin.opcodes.OP_RETURN, data]),
        })
      }

      psbt.signAllInputs(this.ecpair)
      psbt.validateSignaturesOfAllInputs()
      psbt.finalizeAllInputs()

      const txHex = psbt.extractTransaction().toHex()
      return txHex
    } catch (e) {
      console.error(e)
    }
  }

  signAndSendTransaction = async (txParams: TxParams) => {
    try {
      const txHex = await this.signTransaction(txParams)
      const { txid } = (
        await axios.post(
          `${sochainBaseUrl}/send_tx/${this.sochainNetwork}/${txHex}`,
        )
      ).data.data
      return txid
    } catch (error) {
      console.error(error)
    }
  }

  signMessage = async (message: string) => {
    // const signature = bitcoinMessage.sign(
    //   Buffer.from(message, 'utf8'),
    //   Buffer.from(this.privateKey, 'hex'),
    //   this.compressed,
    //   this.prefix.messagePrefix,
    // )
    // return signature.toString('hex')
    return '#'
  }

  verifyAddress = async (address: string): Promise<boolean> => {
    try {
      const res = await axios.get(
        `${sochainBaseUrl}/get_address_balance/${this.sochainNetwork}/${address}`,
      )
      return res.status === 200
    } catch (e) {
      return false
    }
  }
}
