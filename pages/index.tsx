import type { NextPage } from 'next'
import Head from 'next/head'
import { Sidebar, Trade } from 'components'
import { useAppState } from 'lib/overmind'

const Home: NextPage = () => {
  const { appLoading } = useAppState()
  return (
    <>
      <Head>
        <title>{appLoading ? 'Loading...' : 'My Google Wallet'}</title>
        <meta name='description' content='Generated by create next app' />
        <link rel='icon' href='/favicon.ico' />
      </Head>
      <main className='h-[92vh] bg-base grid grid-cols-8 font-Josefin'>
        <Sidebar />
        <Trade />
      </main>
    </>
  )
}

export default Home
