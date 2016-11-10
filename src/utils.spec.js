/* eslint-env jest */
import path from 'path'

// first, dynamically grab the file name of what we're testing
const fileName = path.basename(__filename)
const componentFileName = fileName.match(/([^]+).spec.js/)[1]

// bring in the component to be used in tests
const component = require(`./${componentFileName}.js`)

describe('Transformations for markdown', () => {
  it('should escape only underscores', () => {
    const { escapeUnderscore } = component
    expect(escapeUnderscore('__UsName__')).toBe('\\_\\_UsName\\_\\_')
  })
})
