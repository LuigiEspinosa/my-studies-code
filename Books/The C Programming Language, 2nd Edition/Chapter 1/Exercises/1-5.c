#include <stdio.h>

#define LOWER 0      // Lower limit of table
#define UPPER 300    // Upper limit
#define STEP 20      // Step size

int main(void) {
  int fahr;

  printf("\n");
  printf("Fahrenheit-Celsius Table\n");
  printf("\n");

  for (fahr = LOWER; fahr <= UPPER; fahr += STEP) {
    printf("%3d %6.1f\n", fahr, (5.0 / 9.0) * (fahr - 32));
  }

  printf("\n");
  printf("Fahrenheit-Celsius Table Backwards\n");
  printf("\n");

  for (fahr = UPPER; fahr >= LOWER; fahr -= STEP) {
    printf("%3d %6.1f\n", fahr, (5.0 / 9.0) * (fahr - 32));
  }

  return 0;
}
