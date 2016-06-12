/*
Corner Cases
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
const app = new Koa()
const router = new Router()
const fs = require('fs')
fs.writeFile = promisify(fs.writeFile)
let state = require('./state.json')
let lastParsedCommentIDs = state.lastParsedCommentIDs || []
let lastParsedCommentID = lastParsedCommentIDs[0] || null
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

const headers = {
  'user-agent': `DB3/1.0.0 by MystK`
}

const dev = false
let subreddit = 'changemyview'
let botUsername = credentials.username
if (dev) subreddit = 'changemyviewDB3Dev'

const reddit = new Reddit(credentials)
const entry = async (f) => {
  await reddit.connect()
  if (!lastParsedCommentID) {
    let response = await reddit.query(`/r/${subreddit}/comments`)
    for (let i = 0; i < 5; ++i) {
      lastParsedCommentIDs.push(_.get(response, ['data', 'children', i, 'data', 'name']))
    }
    await fs.writeFile('./state.json', JSON.stringify({ lastParsedCommentIDs }, null, 2))
    lastParsedCommentID = lastParsedCommentIDs[0]
  }
};entry()

const getNewComments = async (recursiveList) => {
  recursiveList = recursiveList || []
  let query = {}
  if (lastParsedCommentID) {
    query = { after: lastParsedCommentID }
    let response = await reddit.query(`/r/${subreddit}/comments?${stringify(query)}`)
    while (!response.data.children.length && lastParsedCommentIDs.length) {
      lastParsedCommentID = lastParsedCommentIDs.shift()
      query = { after: lastParsedCommentID }
      response = await reddit.query(`/r/${subreddit}/comments?${stringify(query)}`)
    }
    lastParsedCommentIDs = []
    lastParsedCommentIDs.push(lastParsedCommentID)
    for (let i = 0; i < 4; ++i) {
      lastParsedCommentIDs.push(_.get(response, ['data', 'children', i, 'data', 'name']))
    }
    await fs.writeFile('./state.json', JSON.stringify({ lastParsedCommentIDs }, null, 2))
    if (lastParsedCommentIDs.length === 0) {
      lastParsedCommentID = null
      await fs.writeFile('./state.json', '{}')

      let response = await reddit.query(`/r/${subreddit}/comments`)
      for (let i = 0; i < 5; ++i) {
        lastParsedCommentIDs.push(_.get(response, ['data', 'children', i, 'data', 'name']))
      }
      await fs.writeFile('./state.json', JSON.stringify({ lastParsedCommentIDs }, null, 2))
      lastParsedCommentID = lastParsedCommentIDs[0]

    }
  }
  query = { before: lastParsedCommentID }
  let response = await reddit.query(`/r/${subreddit}/comments?${stringify(query)}`)
  recursiveList = recursiveList.concat(response.data.children)
  const commentEntriesLength = response.data.children.length
  if (commentEntriesLength) {
    lastParsedCommentID = response.data.children[0].data.name
    lastParsedCommentIDs = []
    query = { after: lastParsedCommentID }
    response = await reddit.query(`/r/${subreddit}/comments?${stringify(query)}`)
    lastParsedCommentIDs.push(lastParsedCommentID)
    for (let i = 0; i < 4; ++i) {
      lastParsedCommentIDs.push(_.get(response, ['data', 'children', i, 'data', 'name']))
    }
    await fs.writeFile('./state.json', JSON.stringify({ lastParsedCommentIDs }, null, 2))
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
    _.each(comments, async (entry, index) => {
      const { link_title, link_id, author, body, body_html, edited, parent_id, id, name, author_flair_text, link_url, created_utc, created } = entry.data
      comments[index] = { link_title, link_id, author, body, body_html, edited, parent_id, id, name, author_flair_text, link_url, created_utc, created }
      const removedBodyHTML = body_html.replace(/blockquote&gt;[^]*\/blockquote&gt;/,'').replace(/pre&gt;[^]*\/pre&gt;/,'')
      if (!!removedBodyHTML.match(/&amp;#8710;|&#8710;|∆|Δ|!delta/)) await verifyThenAward(comments[index])
    })
  } catch (err) {
    console.log('Error!'.red)
    console.error(err)
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
  const res = await reddit.query(`/r/${subreddit}/api/flairlist?${stringify({ name })}`)
  return res.users[0].flair_text
}

const parseHiddenParams = string => {
  try {
    const hiddenSection = string.match(/DB3PARAMSSTART.+DB3PARAMSEND/)[0]
    const stringParams = hiddenSection.slice('DB3PARAMSSTART'.length, -'DB3PARAMSEND'.length)
    params = JSON.parse(stringHiddenParams)
    return params
  } catch (error) {
    return false
  }
}

const createWikiHiddenParams = async content => {
  try {
    const hiddenParams = {
      comment: i18n[locale].hiddenParamsComment,
      deltas: [],
    }
    if (content) {
      let links = content.match(new RegExp(`/r/${subreddit}/comments/[^()[\\]]+\?context=2`, 'g'))
      links = _.uniq(links)
      await new Promise(async (res, rej) => {
        _.forEach(links, async link => {
          const deltaCommentwContext = link.match(/[0-9a-z]+\?context=2/)[0]
          const deltaComment = deltaCommentwContext.replace('?context=2', '')
          const base = link.replace(deltaCommentwContext, '')
          let response = await reddit.query(`${base}${deltaComment}`)
          const title = _.get(response, '[0].data.children[0].data.title').replace(')', '\)')
          const awardedBy = _.get(response, '[1].data.children[0].data.author')
          const unixUTC = _.get(response, '[1].data.children[0].data.created_utc')
          const params = {
            b: base,
            dc: deltaComment,
            t: title,
            ab: awardedBy,
            uu: unixUTC,
          }
          hiddenParams.deltas.push(params)
          if (hiddenParams.deltas.length === links.length) res()
        })
        setTimeout(() => rej(), 60000)
      })
      hiddenParams.deltas = _.sortBy(hiddenParams.deltas, ['uu'])
    }
    return hiddenParams
  } catch (err) {
    console.log('216')
    console.log(err)
  }
}

const verifyThenAward = async comment => {
  const { created_utc: createdUTC, author, body, link_id: linkID, link_title: linkTitle, link_url: linkURL, id, name, parent_id: parentID } = comment
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
      if (author !== 'MystK') {
        console.log(`BAILOUT parent author, ${parentThing.author} is author, ${author}`)
        let text = i18n[locale].noAward['self']
        issues['self'] = 1
        if (query.text.length) query.text += '\n\n'
        query.text += text
      }
    }
    let issueCount = Object.keys(issues).length
    if (issueCount === 0) {
      console.log('THIS ONE IS GOOD. AWARD IT')
      let text = i18n[locale].awardDelta
      text = text.replace(/USERNAME/g, parentThing.author).replace(/SUBREDDIT/g, subreddit)
      if (query.text.length) query.text += '\n\n'
      query.text += text
      const flairCount = await bumpFlairCount({ name: parentThing.author })
      await addDeltaToWiki({ user: parentThing.author, id, linkTitle, linkURL, author, flairCount, createdUTC })
    } else if (issueCount >= 2) {
      let text = i18n[locale].noAward.issueCount
      text = text.replace(/ISSUECOUNT/g, issueCount)
      query.text = `${text}\n\n${query.text}`
    }
    query.text += `${i18n[locale].global}\n[](HTTP://DB3PARAMSSTART\n${JSON.stringify(hiddenParams, null, 2)}\nDB3PARAMSEND)`
    await reddit.query({ URL: `/api/comment?${stringify(query)}`, method: 'POST' })
    return true
  } catch (err) {
    console.log(err)
    return true
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

const checkMessagesforDeltas = async () => {
  try {
    let unreadInboxResponse = await reddit.query(`/message/unread`)
    let comments = (
      _(unreadInboxResponse)
        .get('data.children')
        .reduce((result, obj) => {
          if (obj.data.subject.toLowerCase() === 'add') {
            const commentLinks = _.get(obj, 'data.body').match(new RegExp(`/r/${subreddit}/comments/[^()[\\]& \n]+`, 'g'))
            const fullName = _.get(obj, 'data.name')
            result.names.push(fullName)
            result.commentLinks = result.commentLinks.concat(commentLinks)
            return result
          }
          return result
        }, { names: [], commentLinks: [] })
    )
    comments.commentLinks = _.uniq(comments.commentLinks)
    await reddit.query({ URL: `/api/read_message`, method: 'POST', body: stringify({ id: JSON.stringify(comments.names).replace(/"|\[|\]/g,'') }) })
    _.each(comments.commentLinks, async (commentLink, index) => {
      const response = await reddit.query(`${commentLink}`)
      const { replies, link_id, author, body, body_html, edited, parent_id, id, name, author_flair_text, created_utc, created } = _.get(response, '[1].data.children[0].data')
      const { title: link_title, url: link_url } = _.get(response, '[0].data.children[0].data')
      let comment = { link_title, link_id, author, body, body_html, edited, parent_id, id, name, author_flair_text, link_url, created_utc, created }
      const dbReplied = _.reduce(_.get(replies, 'data.children'), (result, reply) => {
        if (result) return result
        return _.get(reply, 'data.author') === botUsername
      }, false)
      const removedBodyHTML = body_html.replace(/blockquote&gt;[^]*\/blockquote&gt;/,'').replace(/pre&gt;[^]*\/pre&gt;/,'')
      if (!dbReplied && !!removedBodyHTML.match(/&amp;#8710;|&#8710;|∆|Δ|!delta/)) await verifyThenAward(comment)
    })

  } catch (err) {
    console.log('Error!'.red)
    console.error(err)
  }
}
setInterval(checkForDeltas, 10000)
setInterval(checkMessagesforDeltas, 10000)

const getWikiContent = async url => {
  try {
    const resp = await fetch(`https://www.reddit.com/r/${subreddit}/wiki/${url}`, { headers })
    const text = await resp.text()
    return text.match(/<textarea readonly class="source" rows="20" cols="20">[^]+<\/textarea>/)[0].replace(/<textarea readonly class="source" rows="20" cols="20">|<\/textarea>/g, '')
  } catch (err) {
    return false
  }
}

const addDeltaToWiki = async ({ createdUTC, user, linkTitle, id, linkURL, author, flairCount }) => {
  let content = await getWikiContent(`user/${user}`)
  // First, find all wiki pages and combine for parsing
  if (content && content.indexOf('Any delta history before February 2015 can be found at') > -1) {
    const oldContent = await getWikiContent(`userhistory/user/${user}`)
    content += oldContent
  }
  // Look for hidden params. If not there, create
  let hiddenParams = parseHiddenParams(content) || await createWikiHiddenParams(content)
  hiddenParams.deltas.push({
    b: linkURL,
    dc: id,
    t: linkTitle.replace(')', '\)'),
    ab: author,
    uu: createdUTC,
  })
  let newContent = `[](HTTP://DB3PARAMSSTART\n${JSON.stringify(hiddenParams, null, 2)}\nDB3PARAMSEND)\r\n/u/${user} has received ${flairCount} delta(s) for the following comments:\r\n\r\n| Date | Submission | Delta Comment | Awarded By |\r\n| --- | :-: | --- | --- |\r\n`
  _.forEachRight(hiddenParams.deltas, col => {
    const { b, dc, t, ab, uu } = col
    const date = new Date(uu * 1000)
    const [month, day, year] = [date.getMonth() + 1, date.getDate(), date.getFullYear()]
    const newRow = `|${month}/${day}/${year}|[${t.replace('\)', ')')}](${b})|[Link](${b}${dc}?context=2)|/u/${ab}|\r\n`
    newContent += newRow
    process.stdout.write('!')
  })
  const query = {
    page: `user/${user}`,
    reason: 'Added a delta',
    content: newContent
  }
  let response = await reddit.query({ URL: `/r/${subreddit}/api/wiki/edit`, method: 'POST', body: stringify(query) })
}
