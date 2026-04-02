#include <stdio.h>

int bitcount(unsigned);

int bitcount(unsigned x) {
  int b;

  for (b = 0; x != 0; x &= (x - 1)) ++b;
  return b;
}

int main(void) {
  unsigned y = 0x2;

  printf("%i 1-bit(s)\n", bitcount(y));
  return 0;
}
