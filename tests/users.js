import { escapeUsername } from '../delta-boards-three/index.js'

exports.testEscaping = (test) => {
    test.strictEqual(escapeUsername('__UsName__'), '\\_\\_UsName\\_\\_');
    test.done();
};
