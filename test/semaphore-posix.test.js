const { fork } = require('node:child_process');
const childMessages = require('./parent.js');
const { SemaphoreP } = require('../build/Release/OSX.node');

const name = Buffer.from('semaphore-test').toString('base64');
let orderMatters = -1;

describe('SemaphoreP', () => {
  afterAll(() => {
    SemaphoreP.unlink(name);
  });

  it('should throw if the semaphore does not exist', () => {
    expect(++orderMatters).toBe(0);
    expect(() => SemaphoreP.unlink(name)).toThrowErrnoError('sem_unlink', 'ENOENT');
  });

  describe('creation and opening', () => {
    let semaphore;
    afterEach(() => {
      expect(() => semaphore.close()).not.toThrow();
    });

    it('should create a semaphore', () => {
      expect(++orderMatters).toBe(1);
      expect(() => (semaphore = SemaphoreP.createExclusive(name, 0o600, 1))).not.toThrow();
    });

    it('should throw if a semaphore already exists', () => {
      expect(++orderMatters).toBe(2);
      expect(() => SemaphoreP.createExclusive(name, 0o600, 1)).toThrowErrnoError('sem_open', 'EEXIST');
    });

    it('should open the semaphore if it exists', () => {
      expect(++orderMatters).toBe(3);
      expect(() => (semaphore = SemaphoreP.create(name, 0o600, 1))).not.toThrow();
    });

    it('should open a semaphore', () => {
      expect(++orderMatters).toBe(4);
      expect(() => (semaphore = SemaphoreP.open(name))).not.toThrow();
    });
  });

  it('should unlink a semaphore', () => {
    expect(++orderMatters).toBe(5);
    expect(() => SemaphoreP.unlink(name)).not.toThrow();
  });

  describe('when the semaphore does not exist', () => {
    let semaphore;
    afterEach(() => {
      if (semaphore) {
        semaphore.close();
      }
    });

    it('should throw if the semaphore does not exist', () => {
      expect(++orderMatters).toBe(6);
      expect(() => (semaphore = SemaphoreP.open(name))).toThrowErrnoError('sem_open', 'ENOENT');
    });

    it('should create the semaphore if it does not exist', () => {
      expect(++orderMatters).toBe(7);
      expect(() => (semaphore = SemaphoreP.create(name, 0o600, 1))).not.toThrow();
    });
  });

  describe('sempahore operations', () => {
    let semaphore;
    beforeAll(() => {
      semaphore = SemaphoreP.open(name);
    });
    afterAll(() => {
      semaphore.close();
    });

    it('should should decrement the semaphore without blocking', () => {
      expect(++orderMatters).toBe(8);
      expect(() => semaphore.wait()).not.toThrow();
    });

    it('should increment the semaphore without blocking', () => {
      expect(++orderMatters).toBe(9);
      expect(() => semaphore.post()).not.toThrow();
    });

    it('should should decrement the semaphore and return true without blocking', () => {
      expect(++orderMatters).toBe(10);
      expect(semaphore.trywait()).toBe(true);
    });

    it('should not decrement the semaphore and return false without blocking', () => {
      expect(++orderMatters).toBe(11);
      expect(semaphore.trywait()).toBe(false);
    });

    it('should increment the semaphore without blocking', () => {
      expect(++orderMatters).toBe(12);
      expect(() => semaphore.post()).not.toThrow();
    });
  });

  describe('process cooperation', () => {
    let semaphore;
    let messages;
    let child;
    beforeAll(async () => {
      child = fork('./test/semaphore-posix-child.js', ['child'], {
        stdio: [process.stdin, process.stdout, process.stderr, 'ipc'],
        env: { DEBUG_COLORS: '', DEBUG: process.env.DEBUG }
      });

      process.on('SIGINT', () => {
        child.kill('SIGINT');
      });

      const name = Buffer.from('flock-child-' + child.pid).toString('base64');

      messages = childMessages(child);
      await expect(messages.next()).resolves.toEqual({ done: false, value: name });
      semaphore = SemaphoreP.open(name);
    });

    afterAll(async () => {
      semaphore.close();
      child.kill();
      await new Promise((resolve) => child.once('close', resolve));
    });

    describe('non blocking calls', () => {
      it('trywait should return false when the parent has the semaphore', async () => {
        expect(++orderMatters).toBe(13);
        expect(semaphore.trywait()).toBe(true);
        await expect(messages.next('trywait')).resolves.toEqual({
          value: 'not aquired count=0',
          done: false
        });
      });
      it('trywait should return true when the parent does not have the semaphore', async () => {
        expect(++orderMatters).toBe(14);
        expect(() => semaphore.post()).not.toThrow();
        await expect(messages.next('trywait')).resolves.toEqual({
          value: 'aquired count=1',
          done: false
        });
      });
    });
    describe('blocking calls', () => {
      it('trywait should return true when the child does not have the semaphore', async () => {
        expect(++orderMatters).toBe(15);
        await expect(messages.next('post')).resolves.toEqual({
          value: 'released count=0',
          done: false
        });
        expect(semaphore.trywait()).toBe(true);
      });
      it('wait should pause the child until the semaphore is released by the parent', async () => {
        expect(++orderMatters).toBe(16);
        const start = performance.now();
        await expect(messages.next('wait')).resolves.toEqual({
          value: 'waiting',
          done: false
        });
        setTimeout(() => semaphore.post(), 100);
        await expect(messages.next()).resolves.toEqual({
          value: 'aquired count=1',
          done: false
        });
        expect(performance.now() - start).toBeGreaterThan(100);
      });
      it('trywait should return false when the child does have the semaphore', async () => {
        expect(++orderMatters).toBe(17);
        const start = performance.now();
        expect(semaphore.trywait()).toBe(false);
        expect(performance.now() - start).toBeLessThan(100);
      });
      it('trywait should not pause the child until the semaphore is released by the parent', async () => {
        expect(++orderMatters).toBe(18);
        const start = performance.now();
        await expect(messages.next('trywait')).resolves.toEqual({
          value: 'not aquired count=1',
          done: false
        });
        expect(performance.now() - start).toBeLessThan(100);
        semaphore.post();
      });
    });
  });
});
