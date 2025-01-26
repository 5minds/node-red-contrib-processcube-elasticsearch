FROM nodered/node-red:4.0.8-22

# package 
USER root

COPY ./ /package_src/
RUN cd /package_src/ && npm install
    

RUN npm install /package_src/

# test pckages
RUN npm install do-red

# defaults
USER node-red

ENTRYPOINT ["./entrypoint.sh", "--settings", "/data/config.js"]
