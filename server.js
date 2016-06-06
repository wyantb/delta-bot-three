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
import i18n from './i18n'
import { stringify } from 'query-string'
import fetch from 'node-fetch'
let locale = 'en-us'
const dev = true
let subreddit = 'changemyview'
let botUsername = 'DeltaBot'
if (dev) {
  subreddit = 'changemyviewDB3Dev'
  botUsername = 'DeltaBot3'
}
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

const getNewComments = async (recursiveList) => {
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

const checkForDeltas = async () => {
  try {
    let comments = await getNewComments()
    _.each(comments, (entry, index) => {
      const { link_title, link_id, author, body, body_html, edited, parent_id, id, name, author_flair_text, link_url, created_utc, created } = entry.data
      comments[index] = { link_title, link_id, author, body, body_html, edited, parent_id, id, name, author_flair_text, link_url, created_utc, created }
      const removedBodyHTML = body_html.replace(/blockquote&gt;[^]*\/blockquote&gt;/,'').replace(/pre&gt;[^]*\/pre&gt;/,'')
      if (!!removedBodyHTML.match(/&amp;#8710;|&#8710;|∆|Δ|!delta/)) verifyThenAward(comments[index])
    })
  } catch (err) {
    console.log('Error!'.red)
    err
  }
}

router.get('/getNewComments', async (ctx, next) => {
  try {
    let comments = await getNewComments()
    let body = comments
    ctx.body = body
  } catch (err) {
    console.log('Error!'.red)
    ctx.body = err
  }
  await next()
})
router.get('/checkForDeltas', async (ctx, next) => {
  try {
    let comments = await getNewComments()
    await checkForDeltas()
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
  ctx.body = response
  await next()
})

const bumpFlairCount = async ({ name }) => {
  const flair = await getFlair({ name })
  if (flair) var newFlairCount = (+flair.slice(0,-1)) + 1
  else newFlairCount = 1
  const flairQuery = {
    name: name,
    text: newFlairCount + '∆'
  }
  reddit.query({ URL: `/r/${subreddit}/api/flair?${stringify(flairQuery)}`, method: 'POST' })
  return newFlairCount
}

const getFlair = async ({ name }) => {
  const res = await reddit.query({ URL: `/r/${subreddit}/api/flairlist?${stringify({ name })}` })
  return res.users[0].flair_text
}

const parseHiddenParams = comment => {
  const hiddenSection = comment.match(/DB3PARAMSSTART.+DB3PARAMSEND/)[0]
  const stringParams = hiddenSection.slice('DB3PARAMSSTART'.length, -'DB3PARAMSEND'.length)
  params = JSON.parse(stringHiddenParams)
  return params
}

const verifyThenAward = async ({ author, body, link_id: linkID, link_title: linkTitle, link_url: linkURL, id, name, parent_id: parentID }) => {
  try {
    console.log( author, body, linkID, parentID )
    const hiddenParams = {
      comment: i18n[locale].hiddenParamsComment,
      issues: {},
    }
    let issues = hiddenParams.issues
    let query = {
      parent: name,
      text: ''
    }
    let json = await reddit.query(`/r/${subreddit}/comments/${linkID.slice(3)}/?comment=${parentID.slice(3)}`)
    let parentThing = json[1].data.children[0].data
    if (!parentID.match(/^t1_/g)) {
      parentThing = json[0].data.children[0].data
      console.log('BAILOUT delta tried to be awarded to listing')
      console.log(parentID)
      let text = i18n[locale].noAward['op']
      issues['op'] = 1
      if (query.text.length) query.text += '\n\n'
      query.text += text
    }
    if (body.length < 50) {
      console.log(`BAILOUT body length, ${body.length}, is shorter than 50`)
      let text = i18n[locale].noAward['littleText']
      issues['littleText'] = 1
      text = text.replace(/PARENTUSERNAME/g, parentThing.author)
      if (query.text.length) query.text += '\n\n'
      query.text += text
    }
    if (parentThing.author === botUsername) {
      console.log(`BAILOUT parent author, ${parentThing.author} is bot, ${botUsername}`)
      let text = i18n[locale].noAward['db3']
      issues['db3'] = 1
      if (query.text.length) query.text += '\n\n'
      query.text += text
    }
    if (parentThing.author === author) {
      console.log(`BAILOUT parent author, ${parentThing.author} is author, ${author}`)
      let text = i18n[locale].noAward['self']
      issues['self'] = 1
      if (query.text.length) query.text += '\n\n'
      query.text += text
    }
    let issueCount = Object.keys(issues).length
    if (issueCount === 0) {
      console.log('THIS ONE IS GOOD. AWARD IT')
      let text = i18n[locale].awardDelta
      text = text.replace(/USERNAME/g, parentThing.author).replace(/SUBREDDIT/g, subreddit)
      if (query.text.length) query.text += '\n\n'
      query.text += text
      const flairCount = await bumpFlairCount({ name: parentThing.author })
      await addDeltaToWiki({ user: parentThing.author, id, linkTitle, linkURL, author, flairCount })
    } else if (issueCount >= 2) {
      let text = i18n[locale].noAward.issueCount
      text = text.replace(/ISSUECOUNT/g, issueCount)
      query.text = `${text}\n\n${query.text}`
    }
    query.text += `${i18n[locale].global}\n[](HTTP://DB3PARAMSSTART\n${JSON.stringify(hiddenParams, null, 2)}\nDB3PARAMSEND)`
    await reddit.query({ URL: `/api/comment?${stringify(query)}`, method: 'POST' })
  } catch (err) {
    console.log(err)
  }
}

app
  .use(async (ctx, next) => {
    console.log(`${ctx.url}`.gray)
    await next()
  })
  .use(router.routes())
  .use(router.allowedMethods())
  .listen(6969)

setInterval(checkForDeltas, 5000)

const getWikiContent = async user => {
  try {
    const resp = await fetch(`https://www.reddit.com/r/${subreddit}/wiki/user/${user}`)
    const text = await resp.text()
    return text.match(/<textarea readonly class="source" rows="20" cols="20">[^]+<\/textarea>/)[0].replace(/<textarea readonly class="source" rows="20" cols="20">|<\/textarea>/g, '')
  } catch (err) {
    return false
  }
}

const addDeltaToWiki = async ({ user, linkTitle, id, linkURL, author, flairCount }) => {
  let content = await getWikiContent(user)
  const now = new Date()
  const [month, day, year] = [now.getMonth() + 1, now.getDate(), now.getFullYear()]
  const newRow = `|${month}/${day}/${year}|[${linkTitle}](${linkURL})|[Link](${linkURL}${id}?context=2)|/u/${author}|`
  let query
  if (content) {
    query = {
      page: `user/${user}`,
      reason: 'Added Delta',
    }
    if (content.indexOf(`/u/${user} has received `) === -1) {
      query.content = `/u/${user} has received ${flairCount} delta(s) for the following comments:\r\n\r\n${content}\r\n\r\n| Date | Submission | Delta Comment | Awarded By |\r\n| --- | :-: | --- | --- |\r\n${newRow}`
    } else {
      content = content.replace(
        /\/u\/\S+ has received \d+ delta[s()]* for the following comments:/,
        `/u/${user} has received ${flairCount} delta(s) for the following comments:`
      )
      if (content.indexOf(`| Date | Submission | Delta Comment | Awarded By |\r\n| --- | :-: | --- | --- |`) > -1) {
        query.content = content
        .replace(
          '| --- | :-: | --- | --- |',
          `| --- | :-: | --- | --- |\r\n${newRow}`
        )
      } else {
        const pastString = `Any delta history before February 2015 can be found at: /r/ChangeMyView/wiki/userhistory/user/${user}`
        let lengthToSlice = content.indexOf(content.indexOf(pastString)) + 1
        if (lengthToSlice > 0) {
          lengthToSlice += lengthToSlice.length
          const startContent = content.slice(0, lengthToSlice)
          const endContent = content.slice(lengthToSlice)
          query.content = content.replace(
            `Any delta history before February 2015 can be found at: /r/ChangeMyView/wiki/userhistory/user/${user}`,
            `Any delta history before February 2015 can be found at: /r/ChangeMyView/wiki/userhistory/user/${user}\r\n\r\n| Date | Submission | Delta Comment | Awarded By |\r\n| --- | :-: | --- | --- |\r\n${newRow}`
          )
        } else {
          query.content = content.replace(
            `/u/${user} has received ${flairCount} delta(s) for the following comments:`,
            `/u/${user} has received ${flairCount} delta(s) for the following comments:\r\n\r\n| Date | Submission | Delta Comment | Awarded By |\r\n| --- | :-: | --- | --- |\r\n${newRow}`
          )
        }
      }
    }
  } else { // make wiki page
    query = {
      page: `user/${user}`,
      reason: 'Created delta history page with first delta',
      content: `/u/${user} has received ${flairCount} delta(s) for the following comments:\r\n\r\n| Date | Submission | Delta Comment | Awarded By |\r\n| --- | :-: | --- | --- |\r\n${newRow}`
    }
  }
  await reddit.query({ URL: `/r/${subreddit}/api/wiki/edit?${stringify(query)}`, method: 'POST' })
  return true
}
