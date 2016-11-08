/*
import _ from 'lodash'
import { stringify } from 'query-string'
import Api from './../RedditAPIDriver'
import parseHiddenParams from './../parse-hidden-params'
import getWikiContent from './../get-wiki-content'
*/
import checkCommentForDelta from './utils/check-comment-for-delta'

class CheckEditedComments {
  constructor({ snoowrap }) {
    this.snoowrap = snoowrap // this is the Reddit API
  }
  // this method is called by DB3 main code. It starts
  // the whole process of checking edited comments
  async initialStart() {
    // start the scheduled time job
    this.startJob()
  }
  async startJob() {
    const { snoowrap: r } = this
    // first, grab all comments that were edited. It is limited to the last 25.
    const editedRaw = await r.getSubreddit('changemyviewDB3Dev').getEdited({ only: 'comments' })
    for (const commentFromEditedCall of editedRaw) {
      // we have to regrab the comment because we can't fetch replies from the above comment
      const comment = await r.getComment(commentFromEditedCall.id).fetch()
      if (checkCommentForDelta(comment)) {
        console.log('There is a delta in here! Verify this delta comment!')
        console.log(comment)
        // comment.replies = await comment.replies.fetchAll()
      }
    }
    // set the timeout here in case it takes long or hangs,
    // so it doesn't fire off multiple time at once
    // setTimeout(() => this.startJob(), 60000)
  }
}

export default CheckEditedComments
