/*
Corner Cases
Deleted comments are affecting the get new comment
Edited comments are not handled
*/

import 'colors'
import _ from 'lodash'
import promisify from 'promisify-node'
import Koa from 'koa'
import Router from 'koa-router'
import Reddit from './RedditAPIDriver'
import { stringify } from 'query-string'
const dev = true
let subreddit = 'changemyview'
if (dev) subreddit = 'changemyviewDB3Dev'
const app = new Koa()
const router = new Router()
const fs = require('fs')
fs.writeFile = promisify(fs.writeFile)
let state = require('./state.json')
let lastParsedCommentID = state.lastParsedCommentID || null
console.log(`server.js called!`.gray)
try {
  var credentials = require('./credentials')
} catch (err) {
  console.log('Missing credentials! Please contact the author for credentials or create your own credentials json!'.red)
  console.log(`{
  "username": "Your Reddit username",
  "password": "Your Reddit password",
  "clientID": "Your application ID",
  "clientSecret": "Your application secret"
}`.red)
}
const reddit = new Reddit(credentials)
const entry = async (f) => {
  await reddit.connect()
  if (lastParsedCommentID) {
    const query = {after: lastParsedCommentID}
    let response = await reddit.query(`/r/${subreddit}/comments?${stringify(query)}`)
    if (!response.data.children.length) {
      lastParsedCommentID = null
      await fs.writeFile('./state.json', '{}')
      console.log('something up with lastparsedcommend. Removed')
    }
  }
};entry()

router.get('/getNewComments', async (ctx, next) => {
  let getNewComments = async (recursiveList) => {
    recursiveList = recursiveList || []
    let query = {}
    if (lastParsedCommentID) query.before = lastParsedCommentID
    let response = await reddit.query(`/r/${subreddit}/comments?${stringify(query)}`)
    recursiveList = recursiveList.concat(response.data.children)
    const commentEntriesLength = response.data.children.length
    if (commentEntriesLength) {
      lastParsedCommentID = response.data.children[0].data.name
      await fs.writeFile('./state.json', JSON.stringify({ lastParsedCommentID }, null, 2))
    }
    switch (true) {
      case (commentEntriesLength === 25):
        return await getNewComments(recursiveList)
      case (commentEntriesLength !== 25):
      case (commentEntriesLength === 0):
        return recursiveList
    }
  }
  try {
    let comments = await getNewComments()
    _.each(comments, (entry, index) => {
      const { link_title, link_id, author, body, body_html, edited, parent_id, name, author_flair_text, link_url, created_utc, created } = entry.data
      comments[index] = { link_title, link_id, author, body, body_html, edited, parent_id, name, author_flair_text, link_url, created_utc, created }
      const removedBodyHTML = body_html.replace(/blockquote&gt;[^]*\/blockquote&gt;/,'').replace(/pre&gt;[^]*\/pre&gt;/,'')
      if (!!removedBodyHTML.match(/&amp;#8710;|&#8710;|∆|Δ|!delta/)) verifyThenAward(comments[index])
    })
    let body = comments
    ctx.body = body
  } catch (err) {
    console.log('Error!'.red)
    ctx.body = err
  }
  await next()
})
router.get('/dynamic/*', async (ctx, next) => {
  let response = await reddit.query(`/${ctx.params['0']}?${stringify(ctx.query)}`)
/*  const { after, before, children } = response.data
  _.each(children, (entry, index) => {
    const { link_title, link_id, author, body, edited, parent_id, name, author_flair_text, link_url, created_utc, created } = entry.data
    children[index] = { link_title, link_id, author, body, edited, parent_id, name, author_flair_text, link_url, created_utc, created }
  })
  let body = { after, before, children }*/
  ctx.body = response
  await next()
})

const verifyThenAward = async ({ author, body, link_id: linkID, parent_id: parentID }) => {
  console.log('here!!')
  console.log( author, body, linkID, parentID )
  if (!parentID.match(/^t1_/g)) {
    console.log('BAILOUT delta tried to be awarded to listing')
    console.log(parentID)
    return
  }
  if (body.length < 50) {
    console.log('BAILOUT body length')
    console.log(body.length)
    return
  }
  let response = await reddit.query(`/r/${subreddit}/comments/${linkID.slice(3)}/?comment=${parentID.slice(3)}`)
  let json = await response.json()
  let parentComment = json[1].data.children[0].data
  if (json.author === 'DeltaBot') {
    console.log('BAILOUT parent author is DeltaBot')
    console.log(json.author)
    return
  }
  if (author === json.author) {
    console.log('BAILOUT parent author is author')
    console.log(author)
    console.log(json.author)
    return
  }
  console.log('THIS ONE IS GOOD. AWARD IT')
}

app
  .use(async (ctx, next) => {
    console.log(`${ctx.url}`.gray)
    await next()
  })
  .use(router.routes())
  .use(router.allowedMethods())
  .listen(80)