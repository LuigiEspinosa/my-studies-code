# pip3 install bs4

from bs4 import BeautifulSoup
import requests

url = 'https://www.apple.com/es/shop/buy-mac/macbook-air/'

headers = {
  'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
}

response = requests.get(url, headers=headers)

if response.status_code == 200:
  print('La petición fue exitosa')

  soup = BeautifulSoup(response.text, 'html.parser')
  # print(soup.prettify())

  title_tag = soup.title
  if title_tag:
    print(f"El título de la web es: {title_tag.text}")

  # metas = soup.title.parent.find_all('meta')
  # print(metas)

  # # Find price using bs
  # price_span = soup.find('span', class_='rc-prices-fullprice')
  # if price_span:
  #   print(f"El precio del producto es: {price_span.text}")

  # Find all the prices
  # prices_span = soup.find_all(class_='rc-prices-fullprice')
  # for price in prices_span:
  #   print(f"El precio del producto es: {price.text}")

  # Find each product and get the name and the price
  products = soup.find_all(class_="rc-productselection-item")
  for product in products:
    name = product.find(class_="list-title").text
    price = soup.find(class_='rc-prices-fullprice').text
    print(f"El producto:\n{name} \nPrecio de {price}\n\n")
