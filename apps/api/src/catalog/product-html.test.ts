import { parseProductHtml } from './product-html';

const URL_ = 'https://fr.shein.com/Robe-p-1.html';

describe('parseProductHtml', () => {
  it('lit les balises Open Graph et le prix « product: »', () => {
    const html = `<html><head>
      <meta property="og:title" content="Robe midi pliss&eacute;e &amp; col montant">
      <meta content="https://img.ltwebstatic.com/robe.jpg" property="og:image" />
      <meta property="product:price:amount" content="14.99"><meta property="product:price:currency" content="usd">
      <title>Ignoré</title></head></html>`;
    expect(parseProductHtml(html, URL_)).toEqual({
      title: 'Robe midi plissée & col montant',
      imageUrl: 'https://img.ltwebstatic.com/robe.jpg',
      price: { amount: 1499, currency: 'USD' },
    });
  });

  it('préfère le JSON-LD Product (dans un @graph) quand il existe', () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},
      {"@type":"Product","name":"Écouteurs TWS","image":["https://ae01.alicdn.com/x.jpg"],
       "offers":{"@type":"AggregateOffer","lowPrice":"3,07","priceCurrency":"EUR"}}]}</script>
      <meta property="og:title" content="Autre titre">`;
    expect(parseProductHtml(html, URL_)).toEqual({
      title: 'Écouteurs TWS',
      imageUrl: 'https://ae01.alicdn.com/x.jpg',
      price: { amount: 307, currency: 'EUR' },
    });
  });

  it('se rabat sur <title> et ignore une image non https ou un prix sans devise', () => {
    const html = `<title>Organiseur de cuisine &#8211; Temu</title><meta property="og:image" content="http://x/y.jpg">
      <meta property="product:price:amount" content="9.99">`;
    expect(parseProductHtml(html, URL_)).toEqual({
      title: 'Organiseur de cuisine – Temu',
      imageUrl: null,
      price: null,
    });
  });

  it('ignore un JSON-LD invalide', () => {
    expect(
      parseProductHtml('<script type="application/ld+json">{oops</script>', URL_).title,
    ).toBeNull();
  });
});
