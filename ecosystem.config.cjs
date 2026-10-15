module.exports = {
  apps: [
    {
      name: 'autospace-web',
      cwd: __dirname,
      script: 'npm',
      args: 'run start -w @autospace/web -- -H 127.0.0.1 -p 3015',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'autospace-api',
      cwd: __dirname,
      script: 'npm',
      args: 'run start -w @autospace/api',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'autospace-worker',
      cwd: __dirname,
      script: 'npm',
      args: 'run start -w @autospace/worker',
      env: { NODE_ENV: 'production' },
    },
  ],
};
