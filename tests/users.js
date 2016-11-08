import { escapeUnderscore } from './../src/utils.js'

exports.testEscaping = (test) => {
  test.strictEqual(escapeUnderscore('__UsName__'), '\\_\\_UsName\\_\\_')
  test.done()
}
