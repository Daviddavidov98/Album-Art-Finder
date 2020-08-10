const client_id= "ENTER CLIENT ID HERE";
const client_secret = "ENTER CLIENT SECRET HERE";

let base64data = Buffer.from(`${client_id}:${client_secret}`).toString('base64');
console.log(`Basic ${base64data}`)