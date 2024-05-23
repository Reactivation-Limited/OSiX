#include "flock.h"

#include <cerrno>
#include <errnoname.h>
#include <sys/file.h>
#include <system_error>

void Flock::share(int fd) {
  if (flock(fd, LOCK_SH) == 0) {
    return;
  }
  throw std::system_error(errno, std::system_category(), "flock");
};

bool Flock::tryShare(int fd) {
  if (flock(fd, LOCK_SH | LOCK_NB) == 0) {
    return true;
  }
  if (errno == EWOULDBLOCK) {
    return false;
  }
  throw std::system_error(errno, std::system_category(), "flock");
};

void Flock::exclusive(int fd) {
  if (flock(fd, LOCK_EX) == 0) {
    return;
  }
  throw std::system_error(errno, std::system_category(), "flock");
};

bool Flock::tryExclusive(int fd) {
  if (flock(fd, LOCK_EX | LOCK_NB) == 0) {
    return true;
  }
  if (errno == EWOULDBLOCK) {
    return false;
  }
  throw std::system_error(errno, std::system_category(), "flock");
};

void Flock::unlock(int fd) {
  if (flock(fd, LOCK_UN) == 0) {
    return;
  }
  throw std::system_error(errno, std::system_category(), "flock");
};
