import clsx from 'clsx'
import React from 'react'
import { DesktopBreakpoint } from 'src/providers/DesktopBreakpoint'
import { MobileBreakpoint } from 'src/providers/MobileBreakpoint'
import { CardPropsType } from 'src/types'
import { CardItemsProvider } from './CardItemsContext'
import { CopyItemsButton } from './CopyItemsButton'
import { ExportBundleButton } from './ExportBundleButton'

type RootCardProps = CardPropsType & {
  children: React.ReactNode
  titleComponent?: React.ReactNode
  settingsComponent?: React.ReactNode
  fullBlock?: boolean
}
export const Card = React.forwardRef<HTMLDivElement, RootCardProps>(
  (
    { meta, titleComponent, settingsComponent, className, children, fullBlock = false, knob },
    ref
  ) => {
    const { icon, label, badge, link } = meta

    return (
      <CardItemsProvider>
        <div ref={ref} className={clsx('block', fullBlock && 'fullBlock', className)}>
          <MobileBreakpoint>
            <CopyItemsButton
              label={label}
              sourceUrl={link}
              className="floatingCopy"
              iconClassName="floatingFilterIcon"
            />
            <ExportBundleButton
              label={label}
              sourceUrl={link}
              className="floatingExport"
              iconClassName="floatingFilterIcon"
            />
            {settingsComponent && <button className="floatingFilter">{settingsComponent}</button>}
          </MobileBreakpoint>
          <div className="blockHeader">
            {knob}
            <span className="blockHeaderIcon">{icon}</span> {titleComponent || label}{' '}
            <DesktopBreakpoint>
              <CopyItemsButton label={label} sourceUrl={link} />
              <ExportBundleButton label={label} sourceUrl={link} />
              {settingsComponent && (
                <span className="blockHeaderSettingsButton">{settingsComponent}</span>
              )}
            </DesktopBreakpoint>
            {badge && <span className="blockHeaderBadge">{badge}</span>}
          </div>

          <div className="blockContent scrollable">{children}</div>
        </div>
      </CardItemsProvider>
    )
  }
)
