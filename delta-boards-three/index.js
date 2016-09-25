import _ from 'lodash'
import { stringify } from 'query-string'
import Api from './../RedditAPIDriver'
import parseHiddenParams from './../parse-hidden-params'

class DeltaBoardsThree {
  constructor({ credentials, version }) {
    this.credentials = credentials // this is used to log into the Reddit API
    this.version = version // this is used to mark the headers of the API calls
  }
  // this method is called by DB3 main code. It starts
  // the whole process of updating the Delta Boards
  async initialStart() {
    // first, grab the credentials and bot version from this
    const { credentials, version } = this

    // instantiate a new reddit API with the credentials and version
    this.api = new Api(credentials, version, './delta-boards-three/')

    // make the api a variable so we don't access it from 'this' all the time
    const { api } = this
    await api.connect()

    // start the scheduled time job
    this.startJob()
  }
  async startJob() {
    // define methods on top of scope of where it will be used

    // this method return a string that allows us to add metadata
    // to a listing without being seen by anybody other than DB3
    const stringifyObjectToBeHidden = input => (
      `[​](HTTP://DB3PARAMSSTART\n${JSON.stringify(input, null, 2)}\nDB3PARAMSEND)`
    )

    // get the date variables ready
    const now = new Date()
    const nowDayOfTheMonth = now.getDate()
    const nowDayOfTheWeek = now.getDay()
    const nowMonth = now.getMonth()
    const nowYear = now.getFullYear()
    // commented it out in case it's needed
    // const dateOfThisSunday = new Date(nowYear, nowMonth, nowDayOfTheMonth - nowDayOfTheWeek)
    const dateOfFirstDayOfThisMonth = new Date(nowYear, nowMonth)

    // prep the object for the deltaBoards
    const deltaBoards = {
      daily: {}, // updates every minute
      weekly: {}, // updates every minute
      monthly: {}, // updates every hour
      yearly: {}, // updates not yet
    }

    // set when to stop getting new comments by date
    const stopBeforeThisDate = dateOfFirstDayOfThisMonth

    // set up variable for while loop
    let oldestDateParsed = now
    let after
    let noMoreComments

    // begin grabbing and parsing comments to be ready to be used
    while (oldestDateParsed >= stopBeforeThisDate && !noMoreComments) {
      // make a call to get the comments
      const commentQuery = {
        limit: '1000',
        after,
      }
      const { api } = this
      const commentJson = await api.query(`/user/deltabot/comments?${stringify(commentQuery)}`)
      after = _.get(commentJson, 'data.after')
      if (!after) noMoreComments = true

      // grab the relevant data into a variable
      const children = _.get(commentJson, 'data.children')

      // loop through each comment
      for (const child of children) {
        // define methods on top of scope of where it will be used

        // this adds a delta to the deltaBoards. This mutates the board object
        const addDelta = ({ board, username, time }) => {
          // if the username is there already, up the deltacount
          if (username in board) ++board[username].deltaCount
          // if it is not there, create the base
          // because it is looping oldest first, the newestDeltaTime is the first one
          // it sees.
          else {
            board[username] = {
              deltaCount: 1,
              newestDeltaTime: time,
            }
          }
        }

        // grab data from the response and put into variables
        const { body, created_utc: createdUtc } = child.data

        // get the date variables ready
        const childDate = new Date(createdUtc * 1000) // createdUtc is seconds. Date accepts ms
        const childDateDayOfTheMonth = childDate.getDate()
        const childMonth = childDate.getMonth()
        const childYear = childDate.getFullYear()
        const hiddenParams = parseHiddenParams(body)
        const { issues, parentUserName } = hiddenParams
        const issueCount = Object.keys(issues).length

        // waterfall add deltas to the objects if it is a valid delta
        if (issueCount === 0) {
          // set up the waterfall delta date check
          switch (true) {
            // add to daily boards object
            case (nowDayOfTheMonth === childDateDayOfTheMonth): // daily boards
              const { daily } = deltaBoards
              addDelta({
                board: daily,
                username: parentUserName,
                time: createdUtc,
              })
            // add to weekly boards object
            case (
              nowMonth === childMonth &&
              childDateDayOfTheMonth >= (nowDayOfTheMonth - nowDayOfTheWeek)
            ): // weekly boards
              const { weekly } = deltaBoards
              addDelta({
                board: weekly,
                username: parentUserName,
                time: createdUtc,
              })
            // add to monthly boards object
            case (nowMonth === childMonth): // monthly boards
              const { monthly } = deltaBoards
              addDelta({
                board: monthly,
                username: parentUserName,
                time: createdUtc,
              })
            // add to yearly boards object
            case (nowYear === childYear): // yearly boards
              const { yearly } = deltaBoards
              addDelta({
                board: yearly,
                username: parentUserName,
                time: createdUtc,
              })
              break
            default:
              break
          }
        }

        // set the oldestDateParsed
        oldestDateParsed = childDate

        // break when all comments needed are parsed
        if (oldestDateParsed <= stopBeforeThisDate) {
          console.log('broke out of the for loop because oldestDateParsed >= stopBeforeThisDate')
          break
        }
      }
    }

    // parse the data to be .map friendly
    const dataReadyToBeUsed = {
      daily: _(deltaBoards.daily)
        .map((data, username) => _.assign({ username }, data))
        .sortBy(['deltaCount', 'newestDeltaTime'])
        .reverse()
        .take(10)
        .value(),
      weekly: _(deltaBoards.weekly)
        .map((data, username) => _.assign({ username }, data))
        .sortBy(['deltaCount', 'newestDeltaTime'])
        .reverse()
        .take(10)
        .value(),
      monthly: _(deltaBoards.monthly)
        .map((data, username) => _.assign({ username }, data))
        .sortBy(['deltaCount', 'newestDeltaTime'])
        .reverse()
        .take(10)
        .value(),
    }

    // hiddenParams the data
    const hiddenParamedData = stringifyObjectToBeHidden(dataReadyToBeUsed)

    // update the wiki section

    // first start by creating a method which converts the data to line tables
    const mapDataToTable = data => _(data)
      .map((line, index) => {
        const { deltaCount, username } = line
        const rank = index + 1
        return (
          `| ${rank} | ${
            rank === 1 ? `**/u/${username}**` : `/u/${username}`
          } | [${deltaCount}∆](// "deltas received") |`
        )
      })
      .join('\n')

    // create the wiki output
    const wikiOutput = `[**&#8656; back to main wiki page**](http://reddit.com/r/changemyview/wiki)

_____

# Deltaboards

Last updated ${now.toLocaleString()}

**Daily**

| Rank | Username | Deltas |
| :------: | ------ | :------: |
${mapDataToTable(dataReadyToBeUsed.daily)}

**Weekly**

| Rank | Username | Deltas |
| :------: | ------ | :------: |
${mapDataToTable(dataReadyToBeUsed.weekly)}

**Monthly**

| Rank | Username | Deltas |
| :------: | ------ | :------: |
${mapDataToTable(dataReadyToBeUsed.monthly)}

${hiddenParamedData}
`

    // define update wiki parameters
    const updateWikiQuery = {
      page: 'deltaboards',
      reason: 'updated deltaboards',
      content: wikiOutput,
    }

    // declare the subreddit
    const subreddit = this.credentials.subreddit

    // grab the api from this
    const { api } = this

    // updateWikiResponse
    await api.query(
        { URL: `/r/${subreddit}/api/wiki/edit`, method: 'POST', body: stringify(updateWikiQuery) }
    )

    // update the sidebar section

    // get the sidebar data
    const getAboutResponse = await api.query(`/r/${subreddit}/about`)
    let sideBar = _.get(getAboutResponse, 'data.description')

    // create the string that will go into the sidebar
    const newTableToPutIn = `
###### **Monthly Deltaboards**


| Rank | Username | Deltas |
| :------: | ------ | :------: |
${mapDataToTable(dataReadyToBeUsed.monthly)}

Last updated ${now.toLocaleString()}${hiddenParamedData}
`
    let textToReplace
    try {
      textToReplace = sideBar.match(
          new RegExp(
            '\\[.\\]\\(HTTP://DB3PARAMSSTART DB3 AUTO UPDATES START HERE DB3PARAMSEND\\)' +
            '([^]+)' +
            '\\[.\\]\\(HTTP://DB3PARAMSSTART DB3 AUTO UPDATES END HERE DB3PARAMSEND\\)'
          )
        )[1]
    } catch (err) {
      sideBar += '[​](HTTP://DB3PARAMSSTART DB3 AUTO UPDATES START HERE DB3PARAMSEND)' +
        '([^]+)' +
        '[​](HTTP://DB3PARAMSSTART DB3 AUTO UPDATES END HERE DB3PARAMSEND)'
      textToReplace = sideBar.match(
          new RegExp(
            '\\[.\\]\\(HTTP://DB3PARAMSSTART DB3 AUTO UPDATES START HERE DB3PARAMSEND\\)' +
            '([^]+)' +
            '\\[.\\]\\(HTTP://DB3PARAMSSTART DB3 AUTO UPDATES END HERE DB3PARAMSEND\\)'
          )
        )[1]
    }

    // replace the old deltaboards sidebar with the new one
    // also change &gt; to >
    const newSideBarText = sideBar
      .replace(textToReplace, newTableToPutIn)
      .replace(/&gt;/g, '>')
      .replace(/amp;#/g, '#')
      .replace(/amp;\\/g, '\\')
    const currentAboutData = _.get(getAboutResponse, 'data')

    // start params
    const updateSideBarQuery = _.assign({}, currentAboutData, {
      description: newSideBarText,
      sr: currentAboutData.name,
      allow_top: true,
      domain: null,
      exclude_banned_modqueue: false,
      link_type: 'any',
      type: currentAboutData.subreddit_type,
      wikimode: 'modonly',
    })

    // updateSideBar
    await api.query(
      { URL: '/api/site_admin', method: 'POST', body: stringify(updateSideBarQuery) }
    )

    // set the timeout here in case it takes long or hangs,
    // so it doesn't fire off multiple time at once
    setTimeout(() => this.startJob(), 60000)
  }
}

export default DeltaBoardsThree
