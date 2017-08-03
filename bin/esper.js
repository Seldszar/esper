const yargs = require('yargs');
const esper = require('../lib');

const argv = yargs.alias('u', 'units')
  .describe('u', 'units to process')
  .array('u')
  .alias('a', 'animations')
  .describe('a', 'animations to process')
  .array('a')
  .choice('a', ['atk', 'dead', 'dying', 'idle', 'jump', 'limit_atk', 'magic_atk', 'magic_standby', 'move', 'standby', 'win_before', 'win'])
  .help()
  .argv;

esper.process(argv._[0], argv._[1], argv);
