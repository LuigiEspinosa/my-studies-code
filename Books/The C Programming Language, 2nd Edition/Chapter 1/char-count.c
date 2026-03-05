#include <stdio.h>

int main(void) {
  // Count chracter in input; 1st version
  long lnc;

  lnc = 0;
  while (getchar() != EOF) {
    ++lnc;
  }
  printf("%ld\n", lnc);

  // Count chracter in input; 2nd version
  double dnc;

  for (dnc = 0; getchar() != EOF; ++dnc) {
    ;
  }
  printf("%.0f\n", dnc);

  return 0;
}
