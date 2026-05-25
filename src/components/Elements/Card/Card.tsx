import clsx from 'clsx'
import React from 'react'
import { DesktopBreakpoint } from 'src/providers/DesktopBreakpoint'
import { MobileBreakpoint } from 'src/providers/MobileBreakpoint'
import { CardPropsType } from 'src/types'

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
    const { icon, label, badge } = meta

    return (
      <div ref={ref} className={clsx('block', fullBlock && 'fullBlock', className)}>
        <MobileBreakpoint>
          {settingsComponent && <button className="floatingFilter">{settingsComponent}</button>}
        </MobileBreakpoint>
        <div className="blockHeader">
          {knob}
          <span className="blockHeaderIcon">{icon}</span> {titleComponent || label}{' '}
          <DesktopBreakpoint>
            {settingsComponent && (
              <span className="blockHeaderSettingsButton">{settingsComponent}</span>
            )}
          </DesktopBreakpoint>
          {badge && <span className="blockHeaderBadge">{badge}</span>}
        </div>

        <div className="blockContent scrollable">{children}</div>
      </div>
    )
  }
)
