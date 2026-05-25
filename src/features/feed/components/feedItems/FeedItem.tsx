import { BaseItemPropsType, FeedItemData } from 'src/types'
import { ArticleFeedItem } from './ArticleFeedItem'
import { ProductFeedItem } from './ProductFeedItem'
import { RepoFeedItem } from './RepoFeedItem'

export const FeedItem = (props: BaseItemPropsType<FeedItemData>) => {
  const { item } = props

  if (item.type === 'github') {
    return <RepoFeedItem {...props} item={item} />
  }

  if (item.type === 'producthunt') {
    return <ProductFeedItem {...props} item={item} />
  }

  if (item.type === 'post') {
    return <ArticleFeedItem {...props} item={item} />
  }

  return null
}
