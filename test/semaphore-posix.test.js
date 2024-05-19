// const os = require('node:os');
const { fork } = require('node:child_process');
const childMessages = require('./parent.js');
const { SemaphoreP } = require('../build/Release/OSX.node');

const name = Buffer.from('semaphore-test').toString('base64');

describe('SemaphoreP', () => {
  it('should throw if the semaphore does not exist', () => {
    expect(() => SemaphoreP.unlink(name)).toThrowErrnoError('sem_unlink', 'ENOENT');
  });

  describe('creation and opening', () => {
    // order matters
    let semaphore;
    afterEach(() => {
      expect(() => semaphore.close()).not.toThrow();
    });
    afterAll(() => {
      expect(() => SemaphoreP.unlink(name)).not.toThrow();
    });

    it('should create a semaphore, or throw if it already exists', () => {
      expect(() => (semaphore = SemaphoreP.createExclusive(name, 0o600, 1))).not.toThrow();
      expect(() => SemaphoreP.createExclusive(name, 0o600, 1)).toThrowErrnoError('sem_open', 'EEXIST');
    });

    it('should open the semaphore if it exists', () => {
      expect(() => (semaphore = SemaphoreP.create(name, 0o600, 1))).not.toThrow();
    });

    it('should open a semaphore', () => {
      expect(() => (semaphore = SemaphoreP.open(name))).not.toThrow();
    });
  });

  describe('when the semaphore does not exist', () => {
    let semaphore;
    afterEach(() => {
      if (semaphore) {
        semaphore.close();
      }
    });
    afterAll(() => {
      expect(() => SemaphoreP.unlink(name)).not.toThrow();
    });

    it('should throw if the semaphore does not exist', () => {
      expect(() => (semaphore = SemaphoreP.open(name))).toThrowErrnoError('sem_open', 'ENOENT');
    });

    it('should create the semaphore if it does not exist', () => {
      expect(() => (semaphore = SemaphoreP.create(name, 0o600, 1))).not.toThrow();
    });
  });

  describe('sempahore operations', () => {
    let semaphore;
    beforeAll(() => {
      semaphore = SemaphoreP.createExclusive(name, 0o600, 1);
    });
    afterAll(() => {
      semaphore.close();
      SemaphoreP.unlink(name);
    });

    it('should should decrement the semaphore without blocking', () => {
      expect(() => semaphore.wait()).not.toThrow();
    });

    it('should increment the semaphore without blocking', () => {
      expect(() => semaphore.post()).not.toThrow();
    });

    it('should should decrement the semaphore and return true without blocking', () => {
      expect(semaphore.trywait()).toBe(true);
    });

    it('should not decrement the semaphore and return false without blocking', () => {
      expect(semaphore.trywait()).toBe(false);
    });

    it('should increment the semaphore without blocking', () => {
      expect(() => semaphore.post()).not.toThrow();
    });
  });

  describe('semphore operations when the semaphore is closed', () => {
    let semaphore;
    beforeAll(() => {
      semaphore = SemaphoreP.createExclusive(name, 0o600, 1);
      semaphore.close();
    });
    afterAll(() => {
      SemaphoreP.unlink(name);
    });

    // contrary to the man page for sem_*, Darwin returns EBADF if the set_t * passed to sem_wait is nonsense
    // https://github.com/apple-oss-distributions/xnu/blob/94d3b452840153a99b38a3a9659680b2a006908e/bsd/kern/posix_sem.c#L821
    // ... but it turns out that Linux just crashes, so replicate the OS X behaviour and return EBADF if the sem has been closed
    // ... yeah, really you shouldn't do this, but it avoids creating a custom error
    // ... and I'm probably going to remove posix sems anyway as they are not that useful to me
    // const BADSEMPTR = os.type() === 'Darwin' ? 'EBADF' : 'EINVAL';
    const BADSEMPTR = 'EBADF';

    it('wait should throw an errno error', () => {
      expect(() => semaphore.wait()).toThrowErrnoError('sem_wait', BADSEMPTR);
    });

    it('post should throw an errno error', () => {
      expect(() => semaphore.post()).toThrowErrnoError('sem_post', BADSEMPTR);
    });

    it('trywait should throw an errno error', () => {
      expect(() => semaphore.trywait()).toThrowErrnoError('sem_trywait', BADSEMPTR);
    });

    it('close should throw an errno error', () => {
      expect(() => semaphore.close()).toThrowErrnoError('sem_close', BADSEMPTR);
    });
  });

  describe('process cooperation', () => {
    let semaphore;
    let messages;
    let child;
    beforeAll(async () => {
      semaphore = SemaphoreP.createExclusive(name, 0o600, 1);
      child = fork('./test/semaphore-posix-child.js', [name], {
        stdio: [process.stdin, process.stdout, process.stderr, 'ipc'],
        env: { DEBUG_COLORS: '', DEBUG: process.env.DEBUG }
      });

      process.on('SIGINT', () => {
        child.kill('SIGINT');
      });

      messages = childMessages(child);
      await expect(messages.next()).resolves.toEqual({ done: false, value: name });
    });

    afterAll(async () => {
      child.kill('SIGKILL');
      await new Promise((resolve) => {
        child.once('exit', (code, signal) => {
          code ? resolve(code) : resolve(signal);
        });
      });
      semaphore.close();
      SemaphoreP.unlink(name);
    });

    describe('non blocking calls', () => {
      it('trywait should return false when the parent has the semaphore', async () => {
        expect(semaphore.trywait()).toBe(true);
        await expect(messages.next('trywait')).resolves.toEqual({
          value: 'not aquired count=0',
          done: false
        });
      });
      it('trywait should return true when the parent does not have the semaphore', async () => {
        expect(() => semaphore.post()).not.toThrow();
        await expect(messages.next('trywait')).resolves.toEqual({
          value: 'aquired count=1',
          done: false
        });
      });
    });
    describe('blocking calls', () => {
      it('trywait should return true when the child does not have the semaphore', async () => {
        await expect(messages.next('post')).resolves.toEqual({
          value: 'released count=0',
          done: false
        });
        expect(semaphore.trywait()).toBe(true);
      });
      it('wait should pause the child until the semaphore is released by the parent', async () => {
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
        const start = performance.now();
        expect(semaphore.trywait()).toBe(false);
        expect(performance.now() - start).toBeLessThan(100);
      });
      it('trywait should not pause the child until the semaphore is released by the parent', async () => {
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
