import { FaDev, FaFreeCodeCamp, FaMediumM, FaReddit } from 'react-icons/fa'
import { FaLinkedin, FaXTwitter } from 'react-icons/fa6'
import { HiTicket } from 'react-icons/hi'
import { SiGithub, SiYcombinator } from 'react-icons/si'
import HackernoonIcon from 'src/assets/icon_hackernoon.jpeg'
import LobstersIcon from 'src/assets/icon_lobsters.png'
import { SupportedCardType } from 'src/types'
import { lazyImport } from 'src/utils/lazyImport'
const { MediumCard } = lazyImport(() => import('src/features/cards'), 'MediumCard')
const { ConferencesCard } = lazyImport(() => import('src/features/cards'), 'ConferencesCard')
const { DevtoCard } = lazyImport(() => import('src/features/cards'), 'DevtoCard')
const { FreecodecampCard } = lazyImport(() => import('src/features/cards'), 'FreecodecampCard')
const { GithubCard } = lazyImport(() => import('src/features/cards'), 'GithubCard')
const { HackernewsCard } = lazyImport(() => import('src/features/cards'), 'HackernewsCard')
const { LobstersCard } = lazyImport(() => import('src/features/cards'), 'LobstersCard')
const { RedditCard } = lazyImport(() => import('src/features/cards'), 'RedditCard')
const { HackernoonCard } = lazyImport(() => import('src/features/cards'), 'HackernoonCard')
const { LinkedinCard } = lazyImport(() => import('src/features/cards'), 'LinkedinCard')
const { XcomCard } = lazyImport(() => import('src/features/cards'), 'XcomCard')

export const SUPPORTED_CARDS: SupportedCardType[] = [
  {
    value: 'github',
    analyticsTag: 'github',
    label: 'Github repositories',
    component: GithubCard,
    icon: <SiGithub className="blockHeaderWhite" />,
    link: 'https://github.com/',
    type: 'supported',
  },
  {
    value: 'hackernews',
    icon: <SiYcombinator color="#FB6720" />,
    analyticsTag: 'hackernews',
    label: 'Hackernews',
    component: HackernewsCard,
    link: 'https://news.ycombinator.com/',
    type: 'supported',
  },
  {
    value: 'conferences',
    icon: <HiTicket color="#4EC8AF" />,
    analyticsTag: 'events',
    label: 'Upcoming events',
    component: ConferencesCard,
    link: 'https://confs.tech/',
    type: 'supported',
  },
  {
    value: 'devto',
    icon: <FaDev className="blockHeaderWhite" />,
    analyticsTag: 'devto',
    label: 'DevTo',
    component: DevtoCard,
    link: 'https://dev.to/',
    type: 'supported',
  },
  {
    value: 'reddit',
    icon: <FaReddit color="#FF4500" />,
    analyticsTag: 'reddit',
    label: 'Reddit',
    component: RedditCard,
    link: 'https://reddit.com/',
    type: 'supported',
  },
  {
    value: 'lobsters',
    icon: <img alt="lobsters" src={LobstersIcon} />,
    analyticsTag: 'lobsters',
    label: 'Lobsters',
    component: LobstersCard,
    link: 'https://lobste.rs/',
    type: 'supported',
  },
  {
    value: 'freecodecamp',
    icon: <FaFreeCodeCamp className="blockHeaderWhite" />,
    analyticsTag: 'freecodecamp',
    label: 'FreeCodeCamp',
    component: FreecodecampCard,
    link: 'https://freecodecamp.com/news',
    type: 'supported',
  },
  {
    value: 'medium',
    icon: <FaMediumM className="blockHeaderWhite" />,
    analyticsTag: 'medium',
    label: 'Medium',
    component: MediumCard,
    link: 'https://medium.com/',
    type: 'supported',
  },
  {
    value: 'hackernoon',
    analyticsTag: 'hackernoon',
    label: 'Hackernoon',
    component: HackernoonCard,
    icon: <img alt="hackernoon" src={HackernoonIcon} />,
    link: 'https://hackernoon.com/',
    type: 'supported',
  },
  {
    value: 'linkedin',
    analyticsTag: 'linkedin',
    label: 'LinkedIn Feed',
    component: LinkedinCard,
    icon: <FaLinkedin color="#0A66C2" />,
    link: 'https://linkedin.com/',
    type: 'supported',
  },
  {
    value: 'xcom',
    analyticsTag: 'xcom',
    label: 'X.com Feed',
    component: XcomCard,
    icon: <FaXTwitter className="blockHeaderWhite" />,
    link: 'https://x.com/',
    type: 'supported',
  },
]
