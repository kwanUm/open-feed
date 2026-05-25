import { lazyImport } from 'src/utils/lazyImport'
const { CardsLayout } = lazyImport(() => import('./CardsLayout'), 'CardsLayout')

export const AppContentLayout = () => {
  return (
    <>
      <main className="AppContent"><CardsLayout /></main>
    </>
  )
}
