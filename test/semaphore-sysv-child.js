const { SemaphoreV: Semaphore } = require('../build/Release/OSX.node');

const debug = require('debug')('semaphore-sysv-child-process');

const name = process.argv[2];

const send = (...args) => {
  debug('child tx', ...args);
  process.send(...args);
};
let semaphore = Semaphore.open(name);
let count = 0;

const commands = {
  echo: (message) => message,
  wait: () => {
    send('waiting');
    semaphore.wait();
    ++count;
    send('aquired count=1');
  },
  trywait: () => {
    const aquired = semaphore.trywait();
    count += aquired;
    send(`${aquired ? 'aquired' : 'not aquired'} count=${count}`);
  },
  'post-later': () => setTimeout(commands.post, 100),
  post: () => {
    semaphore.post();
    if (count >= 0) {
      --count;
    }
    send(`released count=${count}`);
  }
};

process.on('message', (message) => {
  debug('child rx', message);

  try {
    const command = commands[message];
    if (!command) {
      throw `no command ${message}`;
    }
    command();
    debug('child', count);
  } catch (whatever) {
    debug('catch', whatever);
  }
});

send(name);

const exit = (code) => {
  semaphore.close();
  process.exit(code);
};

setTimeout(() => {
  debug('child died of boredom');
  exit(1);
}, 5000);

process.on('SIGINT', () => {
  exit(0);
});

process.on('SIGTERM', () => {
  exit(0);
});
