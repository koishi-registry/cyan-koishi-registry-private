FROM denoland/deno:2.1.4

WORKDIR /app

# USER deno
USER root
COPY . .

RUN deno install

# These steps will be re-run upon each file change in your working directory:

# Compile the main app so that it doesn't need to be compiled each startup/entry.
RUN deno cache main.ts

CMD ["deno", "task", "start"]
