# OSiX

Some unix IPC primitives for nodejs.

## Why use this lib?

It's crash proof: file locks and semaphores will be released by the kernel no matter how your process dies, well as long as your kernel isn't buggy.

During `npm install` the package verifies that the APIs work as expected on your system.

Built and tested on OSX. So far there are no builds for other flavours of unix, contributions welcome.

There is no hand-holding here - these are thin wrappers over the system calls.

## Installation

`npm install OSiX`

## APIs

### Flock

A simple API that uses the posix `flock` call to implement advisory file locks.

Exposes the posix flock call, but without the bit-twiddling - see `man -s2 flock` for details and the possible error codes.

```javascript
const { Flock } = require('OSiX');
const { open } = require('node:fs/promises');

const F = open('./dir/file-to-lock', 'w+');

// blocking calls
Flock.exclusive(F.fd); // blocks if a process has a shared or exclusive lock
Flock.shared(F.fd); // blocks if a process has an exclusive lock

// non-blocking calls
if (Flock.exclusiveNB(F.fd)) {
  // write to the locked file
} else {
  // do other things and come back later
}
if (Flock.sharedNB(F.fd)) {
  // read from the locked file
} else {
  // do other things and come back later
}

// release the lock - never throws
Flock.unlock(F.fd);
```

Failed calls will throw an error with `error.code` set to a string matching the errno, just like `fs` does it.

For error codes see `man -s2 flock`

Some nodejs fs functions close the file handle automatically, e.g. `F.readFile`, after which `F.fd` will be undefined preventing you from releasing the lock. All is not lost: locks will eventually be released by the kernel when the last file descriptor referencing the file is closed. Despite that, avoid this situation by using read

### Semaphore

A simple API that uses the Unix SystemV `semget` family of system calls to create and use semaphores.

For error codes see `man -s2 semget`, `man -s2 semctl` and `man -s2 semop`. EINTR will never be thrown by this implementation.

All operations are performed with `SEM_UNDO` ensuring that semaphores are released by the kernel when the process exits.

See [https://stackoverflow.com/questions/368322/differences-between-system-v-and-posix-semaphores] for a discussion of the differences between POSIX and SYSV semaphores.

```javascript
const { Semaphore } = require('OSiX');

// create a semaphore, but only if one does not already exist, and set the initial value to 10
const sem = Semaphore.createExclusive('/path/to/some/file', 10);

// open an existing semaphore, or, if it does not exist then create it and set the inital value to 10
// Note: if the semaphore exists, then the initial value is ignored
// (most of the time, this is the function you'll want to use)
const sem = Semaphore.create('/path/to/some/file', 10);

// open an existing semaphore
const sem = Semaphore.open('/path/to/some/file');

// block waiting for the semaphore to be greater than 0
sem.wait(); // block waiting for the semaphore

// if the semaphore value is greater than 0, decrement it and return true, otherwise return false
if (sem.trywait()) {
  // enter crital section of code
} else {
  // do something else
}

sem.valueOf(); // get the current value of the semaphore

sem.post(); // release the semaphore

sem.close(); // decrements the semaphore reference count and unlinks the semphore if this was the last reference by ANY process
```

The `create`, `createExclusive` and `open` calls use `semget` and `semctl` under the hood.

Gotchas:

If the last process with the semaphore open aborts, then the semaphore will not be unlinked, although it's value will be corrected by SEM_UNDO.
Consequently, it is most robust to use `create` to initially create a semaphore.
