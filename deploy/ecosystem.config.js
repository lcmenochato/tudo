module.exports = {
  apps: [
    {
      name: "tiktokshop",
      cwd: "/var/www/tiktokshop",
      script: "server.py",
      interpreter: "python3",
      env: {
        PORT: "8092",
        HOST: "127.0.0.1",
        NODE_ENV: "production",
      },
    },
  ],
};
