# Author: Ammar Bin Mahmud <@abmprottoy>
# Project: Onnorokom School Admission Portal

FROM node:20-alpine
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]