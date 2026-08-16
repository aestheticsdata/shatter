// pm2 app definition. PORT 7000 is the Zeus registry allocation (block 7000-7099)
// and must match the nginx /api/ proxy_pass port in /etc/nginx/conf.d/shatter.conf.
module.exports = {
  apps: [
    {
      name: "shatter-api",
      script: "src/index.js",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        PORT: 7000,
      },
    },
  ],
};
