/*
=-=-=-=-=-=-=-=-=-=-=-=-
Album Art Search
=-=-=-=-=-=-=-=-=-=-=-=-
Comment (Required): Requests artist infro from spotify api 
and requests all the artist's album cover images and outputs 
them on a page. Before requesting api, the program checks 
the authentication-res.json to see if the latest key is expired
and if so it generates a new one and updates the json file with it.
The program also checks the albums folder before requesting to download
them to see if they have been downloaded before, if so it skips that and
just outputs that image from the album directory.  

=-=-=-=-=-=-=-=-=-=-=-=-
*/

const http = require('http');
const port = 3000;
const server = http.createServer();
const fs = require('fs');
const url = require('url');
const credentials = require('./auth/credentials.json');
const https = require('https');
const querystring = require('querystring');
const authentication_cache = './auth/authentication-res.json';

let base64data = Buffer.from(`${credentials.client_id}:${credentials.client_secret}`).toString('base64');

let post_data = {
	"grant_type" : "client_credentials"
};
post_data = querystring.stringify(post_data)
let headers = {
	"Content-Type" : "application/x-www-form-urlencoded"
	,"Authorization" : `Basic ${base64data}`
	,"Content-Length" : post_data.length
};
const options = {
	method: "POST", 
	headers
};
const generate_webpage = function(images, user_input, res){
	let img_tags = [];
	for(let i = 0; i < images.length ; i++){
		img_tags[i] = `<img src="${images[i]}" /> `
	}
	let webpage = `<!DOCTYPE html>\n
	<html>\n
	<body>\n
	<h1>Search Results: ${user_input.artist}</h1>
	\n${img_tags.join("")}
	\n</body>
	\n</html>`;
	res.end(webpage);
}
const download_images= function(response, user_input, res){
	let download_images = 0;
	let dir = `album-art/${querystring.stringify(user_input)}`
	let images = [];
	for(let i = 0; i < response.albums.items.length; i++){
		if(i <= 20){
			let image_url = (response.albums.items[i].images[0].url)
			let path = `album-art${image_url.substring(23)}.jpg`;
			images.push(path);
			// Check album cache
			fs.access(path, fs.constants.F_OK, (err) => {
				if (err) {
					console.log(path,'does NOT exist in memory');
					let image_req = https.get(image_url, function(image_res){
						let new_image = fs.createWriteStream(path, {'encoding':null});
						image_res.pipe(new_image); 
						new_image.on('finish', function(){
							download_images++;
							if(download_images === response.albums.items.length){		
								generate_webpage(images, user_input, res);
							}
						})
					})
					image_req.on('error', function(err){console.log(err);});
				}
				else {
					console.log(path,'exists in cache');
					download_images++;	
					if(download_images === response.albums.items.length){		
						generate_webpage(images, user_input, res);
					}
				}	
			});
		}
	}
}
const create_search_req = function(spotify_auth, user_input, res){
	let params = {
		type: 'album',
		q: user_input.artist,
		access_token: spotify_auth.access_token
	}
	params = querystring.stringify(params)
	const searchOptions = 'https://api.spotify.com/v1/search?' + params;
	const search_req = https.request(searchOptions, function(search_res){
		let body = "";
		search_res.on('data', function(chunk){
			body += chunk;
		});
		search_res.on('end', function(){
			let response = JSON.parse(body);
			download_images(response, user_input, res);
		});
	});
	search_req.on('error', function(err){
		console.error(err);
	});
	search_req.end();
};

const create_access_token_cache = function(cached_auth, user_input, res){
	let cache_valid = false;
	if(fs.existsSync(authentication_cache)){
		if(cached_auth.access_token != require(authentication_cache).access_token){
			fs.writeFile(authentication_cache, JSON.stringify(cached_auth), function(err){
				if (err) throw err;
				console.log("Auth Cache Updated!");
				cached_auth = require(authentication_cache);
			});
		}
		else if (cached_auth.access_token === require(authentication_cache).access_token){
			cached_auth = require(authentication_cache);
		}
		if (new Date(cached_auth.expiration) > Date.now()){
			cache_valid = true;
		}
		else{
			console.log('Token Expired');
			const token_endpoint = "https://accounts.spotify.com/api/token";
			const auth_sent_time = new Date();
			let authentication_req = https.request(token_endpoint, options, function(authentication_res) {
				recieved_authentication(authentication_res, user_input, auth_sent_time, res);
			});
			authentication_req.on('error', function(err){
				console.error(err);
			});
			console.log('Requesting Token');
			authentication_req.end(post_data);
		}
	}
	if(cache_valid) {
		create_search_req(cached_auth, user_input, res);
	}
	else {
		fs.writeFile(authentication_cache, JSON.stringify(cached_auth), function(err){
			if (err) throw err;
			console.log("Auth Cache created successfully");
		});
	}
};


const recieved_authentication = function(authentication_res, user_input, auth_sent_time, res){
	authentication_res.setEncoding('utf8');
	let body = "";
	authentication_res.on('data', function(chunk){
		body += chunk;
	});
	authentication_res.on('end', function(){
		let spotify_auth = JSON.parse(body);
		// calculate time here 
		spotify_auth.expiration = new Date();
		spotify_auth.expiration.setTime(auth_sent_time.getTime());
		spotify_auth.expiration.setHours(auth_sent_time.getHours() + 1);
		create_access_token_cache(spotify_auth, user_input, res);
	})
}


server.on("request", connection_handler);
function connection_handler(req, res){
	console.log(`New Request for ${req.url} from ${req.socket.remoteAddress}`);
	
	if (req.url === '/'){
		const main = fs.createReadStream('html/main.html');
		res.writeHead(200, {'Content-Type':'text/html'});
		main.pipe(res);
	}
	else if (req.url === '/favicon.ico'){
		const main = fs.createReadStream('images/favicon.ico');
		res.writeHead(200, {'Content-Type':'image/x-icon'});
		main.pipe(res);
	}
	else if (req.url === '/images/banner.jpg'){
		const main = fs.createReadStream('images/banner.jpg');
		res.writeHead(200, {'Content-Type':'image/jpeg'});
		main.pipe(res);
	}
	else if (req.url.startsWith('/album-art/')){
		let image_stream = fs.createReadStream(`.${req.url}`);
		image_stream.on('error', function(err){
			res.writeHead(404, {'Content-Type':'text/plain'});
			res.write('404 Not Found');
			res.end();
		});
		image_stream.on('ready', function(){
			res.writeHead(200, {'Content-Type': 'image/jpeg'});
			image_stream.pipe(res);
		});
	}
	else if (req.url.startsWith('/search')){
		const user_input = url.parse(req.url, true).query;
		let base64data = Buffer.from(`${credentials.client_id}:${credentials.client_secret}`).toString('base64');
		const token_endpoint = "https://accounts.spotify.com/api/token";
		const auth_sent_time = new Date();
		let authentication_req = https.request(token_endpoint, options, function(authentication_res) {
			recieved_authentication(authentication_res, user_input, auth_sent_time, res);
		});
		authentication_req.on('error', function(err){
			console.error(err);
		});
		authentication_req.end(post_data);
	}
	else {
		res.writeHead(404, {'Content-Type':'text/plain'});
		res.write('404 Not Found');
		res.end();
	}
}

server.on("listening", listening_handler);
server.listen(port);
function listening_handler(){
	console.log(`Now Listening on Port ${port}`);
}

