# OSiX

Some unix IPC primitives for nodejs I have found useful in my private personal projects - `flock` and SystemV semaphores.

** Alpha version, still in development **

TODO: Linux/Uinx builds

## Why use this lib?

It's crash proof: file locks and semaphores should be released by the kernel no matter how your process dies.

Built and tested on OSX. Working on a Linux build next. I have no plans to support Windows.

There is no hand-holding here - these are thin wrappers over the system calls. If a call throws a system error, treat is as a warning that you've made a mistake in your implementation you should investigate. Failed calls will throw an error with `error.code` set to a string matching the errno, just like `fs` does it.

This is free software. If it breaks you get to keep both pieces. See the `LICENSE`.

## Installation

`npm install OSiX`

## APIs

### Flock

A simple API that uses the POSIX `flock` call to implement advisory file locks - see `man -s2 flock` for details and the possible error codes.

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

Gotchas:

TODO check again if F.readFile/F.writeFile close the file handle ...

### Semaphore

A simple API that uses the Unix SystemV `semget` family of system calls to create and use semaphores.

All operations are performed with `SEM_UNDO` ensuring that semaphores are released by the kernel when the process exits.

For error codes see `man -s2 semget`, `man -s2 semctl` and `man -s2 semop`.

In the case of `EINTR`, the operation will be automatically retried.

See [https://stackoverflow.com/questions/368322/differences-between-system-v-and-posix-semaphores] for a discussion of the differences between POSIX and SYSV semaphores.

TL;DR; POSIX semaphores are lightweight, but have failure modes when a process crashes. SystemV semaphores are "heavier", but more much more robust.

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

If the last process with the semaphore open aborts, then the semaphore will not be unlinked, although it's value will be corrected due to the `SEM_UNDO` semantics. Consequently, it is most robust to use `create` rather than `createExclusive` as the semaphore will already exist if this happens.
