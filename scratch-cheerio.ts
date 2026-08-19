import * as cheerio from 'cheerio'

const html = `<div>
  <h1>Title</h1>
  <p>Some text</p>
  <div>
    <img src="test.jpg" />
    <p>Image desc</p>
  </div>
</div>`

const $ = cheerio.load(html)
const els = $('h1, h2, h3, h4, p, img, table')
els.each((_, el) => {
  console.log(el.tagName)
})
