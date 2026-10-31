import React, { useCallback, useEffect, useState } from 'react';
import { EmblaOptionsType } from 'embla-carousel';
import useEmblaCarousel from 'embla-carousel-react';
import {
  NextButton,
  PrevButton,
  usePrevNextButtons,
} from './EmblaCarouselArrowButtons';

type PropType = {
  slides: ProjectData[];
  options?: EmblaOptionsType;
};

interface ProjectData {
  title: string;
  description: string[];
  hyperlink?: string;
  imageUrl: string;
}

const EmblaCarousel = (props: PropType) => {
  const { slides, options } = props;
  const [emblaRef, emblaApi] = useEmblaCarousel(options);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const {
    prevBtnDisabled,
    nextBtnDisabled,
    onPrevButtonClick,
    onNextButtonClick,
  } = usePrevNextButtons(emblaApi);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('reInit', onSelect).on('select', onSelect);
  }, [emblaApi, onSelect]);

  useEffect(() => {
    if (!emblaApi) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        emblaApi.scrollPrev();
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        emblaApi.scrollNext();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [emblaApi]);

  const total = slides.length;
  const indexLabel = `${String(selectedIndex + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;

  return (
    <div className="embla">
      <div className="embla__viewport" ref={emblaRef}>
        <div className="embla__container">
          {slides.map((slide) => (
            <div className="embla__slide" key={slide.title}>
              <div className="slide-layout">
                <div className="slide-text">
                  <h3 className="slide-title">{slide.title}</h3>
                  {slide.description.map((line, index) => (
                    <p className="slide-description" key={`${slide.title}-${index}`}>
                      {line}
                    </p>
                  ))}
                  {slide.hyperlink ? (
                    <a
                      className="slide-link ink-link"
                      href={slide.hyperlink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      view project →
                    </a>
                  ) : null}
                </div>
                {slide.hyperlink ? (
                  <a
                    className="slide-media"
                    href={slide.hyperlink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <img src={slide.imageUrl} alt={slide.title} className="slide-image" />
                  </a>
                ) : (
                  <div className="slide-media">
                    <img src={slide.imageUrl} alt={slide.title} className="slide-image" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="embla__controls">
        <div className="embla__buttons">
          <PrevButton onClick={onPrevButtonClick} disabled={prevBtnDisabled} />
          <NextButton onClick={onNextButtonClick} disabled={nextBtnDisabled} />
        </div>
        <div className="embla__index" aria-live="polite">
          {indexLabel}
        </div>
      </div>
    </div>
  );
};

export default EmblaCarousel;
