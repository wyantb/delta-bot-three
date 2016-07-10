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
let state
let lastParsedCommentIDs
let lastParsedCommentID
try {
  state = require('./state.json')
  lastParsedCommentIDs = state.lastParsedCommentIDs || []
  lastParsedCommentID = lastParsedCommentIDs[0] || null
} catch (err) {
  state = {}
}
console.log(`server.js called!`.gray)
try {
  var credentials = require('./credentials')
} catch (err) {
  console.log('Missing credentials! Please contact the author for credentials or create your own credentials json!'.red)
  console.log(`{
  "username": "Your Reddit username",
  "password": "Your Reddit password",
  "clientID": "Your application ID",
  "clientSecret": "Your application secret",
  "subreddit": "Your subreddit to moderate"
}`.red)
}
const packageJson = require('./package.json')
const headers = {
  'user-agent': `DB3/v${packageJson.version} by MystK`
}

let subreddit = credentials.subreddit
let botUsername = credentials.username

const reddit = new Reddit(credentials, packageJson.version)
const entry = async (f) => {
  await reddit.connect()
  if (!lastParsedCommentID) {
    let response = await reddit.query(`/r/${subreddit}/comments.json`, true)
    for (let i = 0; i < 5; ++i) {
      lastParsedCommentIDs.push(_.get(response, ['data', 'children', i, 'data', 'name']))
    }
    await fs.writeFile('./state.json', JSON.stringify({ lastParsedCommentIDs }, null, 2))
    lastParsedCommentID = lastParsedCommentIDs[0]
  }
  checkForDeltas()
  checkMessagesforDeltas()
};entry()

const getNewComments = async (recursiveList) => {
  recursiveList = recursiveList || []
  let query = {}
  if (lastParsedCommentID) {
    query = { after: lastParsedCommentID }
    let response = await reddit.query(`/r/${subreddit}/comments.json?${stringify(query)}`, true)
    if (response.error) throw Error(response.error)
    while (!response.data.children.length && lastParsedCommentIDs.length) {
      lastParsedCommentID = lastParsedCommentIDs.shift()
      query = { after: lastParsedCommentID }
      response = await reddit.query(`/r/${subreddit}/comments.json?${stringify(query)}`, true)
      if (response.error) throw Error(response.error)
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

      let response = await reddit.query(`/r/${subreddit}/comments.json`, true)
      if (response.error) throw Error(response.error)
      for (let i = 0; i < 5; ++i) {
        lastParsedCommentIDs.push(_.get(response, ['data', 'children', i, 'data', 'name']))
      }
      await fs.writeFile('./state.json', JSON.stringify({ lastParsedCommentIDs }, null, 2))
      lastParsedCommentID = lastParsedCommentIDs[0]

    }
  }
  query = { before: lastParsedCommentID }
  let response = await reddit.query(`/r/${subreddit}/comments.json?${stringify(query)}`, true)
  if (response.error) throw Error(response.error)
  recursiveList = recursiveList.concat(response.data.children)
  const commentEntriesLength = response.data.children.length
  if (commentEntriesLength) {
    lastParsedCommentID = response.data.children[0].data.name
    lastParsedCommentIDs = []
    query = { after: lastParsedCommentID }
    response = await reddit.query(`/r/${subreddit}/comments.json?${stringify(query)}`, true)
    if (response.error) throw Error(response.error)
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
  console.log('$')
  try {
    let comments = await getNewComments()
    _.each(comments, async (entry, index) => {
      const { link_title, link_id, author, body, body_html, edited, parent_id, id, name, author_flair_text, link_url, created_utc, created } = entry.data
      comments[index] = { link_title, link_id, author, body, body_html, edited, parent_id, id, name, author_flair_text, link_url, created_utc, created }
      const removedBodyHTML = body_html.replace(/blockquote&gt;[^]*\/blockquote&gt;/,'').replace(/pre&gt;[^]*\/pre&gt;/,'')
      if (!!removedBodyHTML.toLowerCase().match(/&amp;#8710;|&#8710;|∆|Δ|!delta/)) await verifyThenAward(comments[index])
    })
  } catch (err) {
    console.log('Error!'.red)
    console.error(err)
  }
  setTimeout(checkForDeltas, 30000)
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
  if (response.error) throw Error(response.error)
  ctx.body = response
  await next()
})

const updateFlair = async ({ name, flairCount }) => {
  const flairQuery = {
    name: name,
    text: flairCount + '∆'
  }
  let response = await reddit.query({ URL: `/r/${subreddit}/api/flair?${stringify(flairQuery)}`, method: 'POST' })
  if (response.error) throw Error(response.error)
  return true
}

const getFlair = async ({ name }) => {
  const res = await reddit.query(`/r/${subreddit}/api/flairlist?${stringify({ name })}`)
  return res.users[0].flair_text
}

const parseHiddenParams = string => {
  try {
    const hiddenSection = string.match(/DB3PARAMSSTART[^]+DB3PARAMSEND/)[0]
    const stringParams = hiddenSection.slice('DB3PARAMSSTART'.length, -'DB3PARAMSEND'.length).replace(/&quot;/g, '"')
    return JSON.parse(stringParams)
  } catch (error) {
    return false
  }
}

const createWikiHiddenParams = async (content) => {
  try {
    const hiddenParams = {
      comment: i18n[locale].hiddenParamsComment,
      deltas: [],
    }
    if (content) {
      let links = _.uniq(content.match(new RegExp(`/r/${subreddit}/comments/[^()[\\]]+\?context=2`, 'g')))
      const arrayFullnames = (
        _(links)
          .reduce((a, e, i) => {
            const arrayIndex = Math.floor(i/100)
            a[arrayIndex] = a[arrayIndex] || []
            a[arrayIndex].push(`t1_${e.replace(e.slice(0, e.lastIndexOf('/') + 1), '').replace('?context=2', '')}`)
            return a
          }, [])
          .map(e => e.join(','))
      )
      await new Promise(async (res, rej) => {
        _.forEach(arrayFullnames, async (fullnames) => {
          try {
            const commentRes = await reddit.query(`/r/${subreddit}/api/info?${stringify({ id: fullnames })}`)
            if (commentRes.error) throw Error(commentRes.error)
            const comments = _.get(commentRes, 'data.children')
            let fullLinkIds = _.reduce(comments, (array, comment) => {
              const linkId = _.get(comment, 'data.link_id')
              array.push(linkId)
              return array
            }, []).join(',')
            const listingsRes = await reddit.query(`/r/${subreddit}/api/info?${stringify({ id: fullLinkIds })}`)
            const listingsData = _.get(listingsRes, 'data.children')
            const titles = _.reduce(listingsData, (array, listing) => {
              const title = _.get(listing, 'data.title').replace(/\)/g, 'AXDK9vhFALCkjXPmwvSB')
              array.push(title)
              return array
            }, [])
            const baseUrls = _.reduce(listingsData, (array, listing) => {
              const title = _.get(listing, 'data.permalink').replace(/\)/g, 'AXDK9vhFALCkjXPmwvSB')
              array.push(title)
              return array
            }, [])
            _.forEach(comments, (comment, i) => {
              const name = _.get(comment, 'data.name').replace('t1_', '') // this is the comment id
              const base = baseUrls[i]
              const title = titles[i]
              const awardedBy = _.get(comment, 'data.author')
              const unixUTC = _.get(comment, 'data.created_utc')
              const params = {
                b: base,
                dc: name,
                t: title,
                ab: awardedBy,
                uu: unixUTC,
              }
              hiddenParams.deltas.push(params)
            })
            if (hiddenParams.deltas.length === links.length) res()
          } catch (err) {
            console.log(err)
          }
        })
        setTimeout(() => rej(), 60000)
      })
      return hiddenParams
    }
    return hiddenParams
  } catch (err) {
    console.log('216')
    console.log(err)
    return {
      comment: i18n[locale].hiddenParamsComment,
      deltas: [],
    }
  }
}

const verifyThenAward = async (comment) => {
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
    if (json.error) throw Error(json.error)
    let parentThing = json[1].data.children[0].data
    const listing = json[0].data.children[0].data
    if (parentThing.author === '[deleted]') return true
    if (!parentID.match(/^t1_/g) || parentThing.author === listing.author && author.toLowerCase() !== 'mystk') {
      console.log(`BAILOUT parent author, ${parentThing.author} is listing author, ${listing.author}`)
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
    if (parentThing.author === author && author.toLowerCase() !== 'mystk') {
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
      const flairCount = await addDeltaToWiki({ user: parentThing.author, id, linkTitle, linkURL, author, createdUTC })
      await updateFlair({ name: parentThing.author , flairCount })
    } else {
      let rejected = i18n[locale].noAward.rejected
      if (issueCount >= 2) {
        let issueCi18n = i18n[locale].noAward.issueCount
        issueCi18n = issueCi18n.replace(/ISSUECOUNT/g, issueCount)
        query.text = `${rejected} ${issueCi18n}\n\n${query.text}`
      } else {
        query.text = `${rejected} ${query.text}`
      }
    }
    query.text += `${i18n[locale].global}\n[](HTTP://DB3PARAMSSTART\n${JSON.stringify(hiddenParams, null, 2)}\nDB3PARAMSEND)`
    let send = await reddit.query({ URL: `/api/comment?${stringify(query)}`, method: 'POST' })
    if (send.error) throw Error(send.error)
    const flattened = _.flattenDeep(send.jquery)
    const commentFullName = _.get(_.find(flattened, 'data.name'), 'data.name')
    let distinguishResp = await reddit.query({ URL: `/api/distinguish?${stringify({ id: commentFullName, how: 'yes' })}`, method: 'POST' })
    if (distinguishResp.error) throw Error(distinguishResp.error)
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
  console.log('.')
  try {
    let unreadInboxResponse = await reddit.query(`/message/unread`)
    if (unreadInboxResponse.error) throw Error(unreadInboxResponse.error)
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
    if (comments.commentLinks.length) {
      comments.commentLinks = _.uniq(comments.commentLinks)
      const read = await reddit.query({ URL: `/api/read_message`, method: 'POST', body: stringify({ id: JSON.stringify(comments.names).replace(/"|\[|\]/g,'') }) })
      if (read.error) throw Error(read.error)
      for (let i = 0; i < comments.commentLinks.length; ++i) {
        const commentLink = comments.commentLinks[i]
        const response = await reddit.query(`${commentLink}`)
        const { replies, link_id, author, body, body_html, edited, parent_id, id, name, author_flair_text, created_utc, created } = _.get(response, '[1].data.children[0].data')
        const { title: link_title, url: link_url } = _.get(response, '[0].data.children[0].data')
        let comment = { link_title, link_id, author, body, body_html, edited, parent_id, id, name, author_flair_text, link_url, created_utc, created }
        const dbReplied = _.reduce(_.get(replies, 'data.children'), (result, reply) => {
          if (result) return result
          return _.get(reply, 'data.author') === botUsername
        }, false)
        const removedBodyHTML = body_html.replace(/blockquote&gt;[^]*?\/blockquote&gt;/,'').replace(/pre&gt;[^]*?\/pre&gt;/,'')
        if (!dbReplied && !!removedBodyHTML.toLowerCase().match(/&amp;#8710;|&#8710;|∆|Δ|!delta/)) await verifyThenAward(comment)
      }
    }
  } catch (err) {
    console.log('Error!'.red)
    console.error(err)
  }
  setTimeout(checkMessagesforDeltas, 30000)
}

const getWikiContent = async (url) => {
  try {
    const resp = await reddit.query(`/r/${subreddit}/wiki/${url}`, true, true)
    return resp.match(/<textarea readonly class="source" rows="20" cols="20">[^]+<\/textarea>/)[0].replace(/<textarea readonly class="source" rows="20" cols="20">|<\/textarea>/g, '')
  } catch (err) {
    return false
  }
}

const addDeltaToWiki = async ({ createdUTC, user, linkTitle, id, linkURL, author }) => {
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
    t: linkTitle.replace(/\)/g, 'AXDK9vhFALCkjXPmwvSB'),
    ab: author,
    uu: createdUTC,
  })
  hiddenParams.deltas = _.uniqBy(hiddenParams.deltas, 'dc')
  hiddenParams.deltas = _.sortBy(hiddenParams.deltas, ['uu'])
  const flairCount = hiddenParams.deltas.length
  let newContent = `[](HTTP://DB3PARAMSSTART\n${JSON.stringify(hiddenParams, null, 2)}\nDB3PARAMSEND)\r\n/u/${user} has received ${flairCount} delta${flairCount === 1 ? '': 's'} for the following comments:\r\n\r\n| Date | Submission | Delta Comment | Awarded By |\r\n| --- | :-: | --- | --- |\r\n`
  _.forEachRight(hiddenParams.deltas, col => {
    const { b, dc, t, ab, uu } = col
    const date = new Date(uu * 1000)
    const [month, day, year] = [date.getMonth() + 1, date.getDate(), date.getFullYear()]
    const newRow = `|${month}/${day}/${year}|[${t.replace(/AXDK9vhFALCkjXPmwvSB/g, ')')}](${b})|[Link](${b}${dc}?context=2)|/u/${ab}|\r\n`
    newContent += newRow
  })
  const query = {
    page: `user/${user}`,
    reason: 'Added a delta',
    content: newContent
  }
  let response = await reddit.query({ URL: `/r/${subreddit}/api/wiki/edit`, method: 'POST', body: stringify(query) })
  if (response.error) throw Error(response.error)
  return flairCount
}
