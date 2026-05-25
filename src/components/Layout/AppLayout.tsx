import React from 'react'
import 'react-contexify/dist/ReactContexify.css'
import { Outlet } from 'react-router-dom'
import { BeatLoader } from 'react-spinners'
import 'src/assets/App.css'
import { Header } from './Header'

export const AppLayout = () => {
  return (
    <div className="App">
      <Header />
      <React.Suspense
        fallback={
          <div className="appLoading">
            <BeatLoader color={'#A9B2BD'} loading={true} size={15} />
          </div>
        }>
        <Outlet />
      </React.Suspense>
    </div>
  )
}
