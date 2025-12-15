#include <stdio.h>

/* print Fahrenheit-Celsius table
  for fahr = 0, 20, ..., 300 */
int main() {
  float fahr, celsius;
  int lower, upper, step;

  lower = 0; /* lower limit of temperature table */
  upper = 300; /* upper limit */
  step = 20; /* step size */

  printf("\n");
  printf("Celsius-Fahrenheit Table\n");
  printf("\n");
  
//  (°C × 9/5) + 32

  celsius = lower;
  while (celsius <= upper) {
    fahr = (celsius * 9.0/5.0) + 32.0;
    printf("%3.0f %6.1f\n", celsius, fahr);
    celsius += step;
  }
}
