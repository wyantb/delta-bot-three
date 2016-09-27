const entities = require('html-entities').AllHtmlEntities

export default async ({ api, subreddit, wikiPage }) => {
  try {
    const resp = await api.query(`/r/${subreddit}/wiki/${wikiPage}`, true, true)
    const html = resp.match(
        /<textarea readonly class="source" rows="20" cols="20">[^]+<\/textarea>/
    )[0].replace(/<textarea readonly class="source" rows="20" cols="20">|<\/textarea>/g, '')
    const decoded = entities.decode(html)
    return decoded
  } catch (err) {
    return false
  }
}
