#!/bin/bash

build() {
    echo 'Building OpenFeed...'
    rm -rf dist
    vite build "$@"
}

build "$@"