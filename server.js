const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.use(express.static('.'));

// 画像URLをBase64に変換する共通関数
async function getBase64(url) {
    if (!url) return null;
    try {
        const res = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://momon-ga.com/'
            }
        });

        const contentType = res.headers['content-type'];
        const base64 = Buffer.from(res.data).toString('base64');

        // data:image/jpeg;base64,xxxxx の文字列として返す
        return `data:${contentType};base64,${base64}`;

    } catch (e) {
        console.error(`Image Fetch Error: ${url}`, e.message);
        return null;
    }
}

app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.json({ result: [] });

    try {
        const response = await axios.get(`https://momon-ga.com/?s=${encodeURIComponent(query)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
            }
        });

        const html = response.data;
        const results = [];

        // 1. post-list内の <a> タグを抽出
        // 構造: <a href=".../fanzine/moID/"> ... <img src="IMG_URL" alt="TITLE" /> ... <span>TITLE</span> </a>
        const postRegex = /<a href="https:\/\/momon-ga\.com\/(?:fanzine|magazine)\/(mo[0-9-]+)\/">[\s\S]*?<img src="([^"]+)"[\s\S]*?alt="([^"]+)"/g;

        let match;

        while ((match = postRegex.exec(html)) !== null) {

            // サムネ画像もサーバー側でBase64化
            const base64Image = await getBase64(match[2]);

            results.push({
                id: match[1],
                image: base64Image,
                title: match[3],
                rule: ""
            });
        }

        console.log(`Query: ${query}, Found: ${results.length} items`);

        res.json({ result: results });

    } catch (error) {

        console.error("Search API Error:", error.message);

        res.status(500).json({ error: "Search failed" });
    }
});

// 全ての画像処理をサーバーサイドで行い、Base64配列として返却する
app.get('/api/proxy-details', async (req, res) => {

    const targetUrl = req.query.url;

    if (!targetUrl) return res.status(400).send("URL is required");

    try {

        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });

        const htmlString = response.data;

        const imgUrls = [];

        const galleryRegex = /src="([^"]*galleries[^"]*)"/g;

        let match;

        while ((match = galleryRegex.exec(htmlString)) !== null) {

            let src = match[1];

            if (src.startsWith('/')) {
                src = 'https://momon-ga.com' + src;
            }

            imgUrls.push(src);
        }

        const uniqueImgUrls = [...new Set(imgUrls)];

        // 全画像をBase64文字列化
        const imageUrlsBase64 = await Promise.all(
            uniqueImgUrls.map(url => getBase64(url))
        );

        // null除外
        const filteredImages = imageUrlsBase64.filter(img => img !== null);

        const titleMatch = htmlString.match(/<h1[^>]*>(.*?)<\/h1>/);

        const title = titleMatch
            ? titleMatch[1].replace(/<[^>]*>?/gm, '').trim()
            : "No Title";

        // Base64文字列配列を返却
        res.json({
            title,
            images: filteredImages
        });

    } catch (e) {

        console.error(e.message);

        res.status(500).send("Detail fetch error");
    }
});

// 単体画像ProxyもBase64文字列で返却
app.get('/api/image-proxy', async (req, res) => {

    const imageUrl = req.query.url;

    try {

        const response = await axios({
            method: 'get',
            url: imageUrl,
            responseType: 'arraybuffer',
            headers: {
                'Referer': 'https://momon-ga.com/'
            }
        });

        const contentType = response.headers['content-type'];

        const base64 = Buffer.from(response.data, 'binary').toString('base64');

        // 文字列として返す
        res.setHeader('Content-Type', 'text/plain');

        res.send(`data:${contentType};base64,${base64}`);

    } catch (e) {

        console.error(e.message);

        res.status(500).send("Image proxy error");
    }
});

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
