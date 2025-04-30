# pip3 install requests -> instalas la dependencia para hacer peticiones

import requests
import re

url = 'https://www.apple.com/es/shop/buy-mac/macbook-air/'

response = requests.get(url)

if response.status_code == 200:
  print('La petición fue exitosa')

html = response.text
print(html)

# Expresión regular para encontrar el precio

price_pattern = r'<span class="rc-prices-fullprice">(.*?)</span>'
match = re.search(price_pattern, html)

if match:
  print(f"El precio del producto es: {match.group(1)}")

# Obtener el título de la página si se encuentra el patrón

title_pattern = r'<title>(.*?)</title>'
match = re.search(title_pattern, html)

if match:
  print(f"El título de la web es: {match.group(1)}")
  