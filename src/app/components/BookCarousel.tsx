"use client";

import Image from "next/image";
import React, { useEffect, useRef } from "react";

import "~/styles/carousel.css";

const FEATURED_BOOKS = [
  {
    title: "Atomic Habits",
    thumbnail: "https://covers.openlibrary.org/b/id/14816206-L.jpg",
  },
  {
    title: "Life 3.0",
    thumbnail: "https://covers.openlibrary.org/b/id/10412416-L.jpg",
  },
  {
    title: "Barking Up the Wrong Tree",
    thumbnail:
      "https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1489173753i/31706504.jpg",
  },
  {
    title: "The Singularity is Near",
    thumbnail: "https://covers.openlibrary.org/b/id/7447890-L.jpg",
  },
  {
    title: "Plays Well with Others",
    thumbnail:
      "https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1648413155i/58782858.jpg",
  },
  {
    title: "AI Superpowers",
    thumbnail:
      "https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1521228712i/38242135.jpg",
  },
  {
    title: "Homo Deus",
    thumbnail:
      "https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1468760805i/31138556.jpg",
  },
  {
    title: "Range",
    thumbnail:
      "https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1550048292i/41795733.jpg",
  },
  {
    title: "Thinking, Fast and Slow",
    thumbnail:
      "https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1317793965i/11468377.jpg",
  },
  {
    title: "The 7 Habits of Highly Effective People",
    thumbnail:
      "https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1421842784i/36072.jpg",
  },
];

export default function BookCarousel() {
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    let angle = 0;
    const radius = 250;
    const increment = (2 * Math.PI) / FEATURED_BOOKS.length;

    const arrangeBooks = () => {
      FEATURED_BOOKS.forEach((book, index) => {
        const theta = index * increment + angle;
        const x = radius * Math.cos(theta);
        const z = radius * Math.sin(theta);
        const element = carousel.children[index] as HTMLElement;
        element.style.transform = `translateX(${x}px) translateZ(${z}px)`;
      });
    };

    const rotate = () => {
      angle += 0.01;
      arrangeBooks();
      requestAnimationFrame(rotate);
    };

    rotate();
  }, []);

  return (
    <div className="scene">
      <div className="carousel" ref={carouselRef}>
        {FEATURED_BOOKS.map((book, index) => (
          <div key={index} className="carousel__cell">
            <Image
              src={book.thumbnail}
              alt={book.title}
              width={150}
              height={200}
              className="bookImage transition-all duration-300 ease-in-out hover:scale-110"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
