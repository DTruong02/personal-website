import React from 'react'
import { EmblaOptionsType } from 'embla-carousel'
import useEmblaCarousel, {
  type UseEmblaCarouselType,
} from "embla-carousel-react";
import {
  NextButton,
  PrevButton,
  usePrevNextButtons
} from './EmblaCarouselArrowButtons'

type CarouselApi = UseEmblaCarouselType[1];
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>;
type CarouselOptions = UseCarouselParameters[0];
type CarouselPlugin = UseCarouselParameters[1];

type CarouselProps = {
  opts?: CarouselOptions;
  plugins?: CarouselPlugin;
  orientation?: "horizontal" | "vertical";
  setApi?: (api: CarouselApi) => void;
};
type PropType = {
  slides: ProjectData[]
  options?: EmblaOptionsType
}

interface ProjectData {
  title: string;
  description: string[];
  hyperlink?: string;
  imageUrl: string;
}



const EmblaCarousel = (props: PropType) => {
  const { slides, options } = props
  const [emblaRef, emblaApi] = useEmblaCarousel(options)

  const {
    prevBtnDisabled,
    nextBtnDisabled,
    onPrevButtonClick,
    onNextButtonClick
  } = usePrevNextButtons(emblaApi)

  return (
    <div className="embla">
      <div className="embla__viewport" ref={emblaRef}>
        <div className="embla__container">
          {slides.map((slide) => (
            <div className="embla__slide" key={slide.title}>
              <div className="embla__slide__number">
                <div className="slide-text">
                  <span className="slide-title">{slide.title}</span>
                  {slide.description.map((line, index) => (
                    <p className="slide-description" key={`${slide.title}-${index}`}>
                      {line}
                    </p>
                  ))}
                </div>
                <a className="slide-link" href={slide.hyperlink} target="_blank" rel="noopener noreferrer">
                  <img src={slide.imageUrl} alt={slide.title} className="slide-image"/>
                </a>
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
      </div>
    </div>
  )
}

export default EmblaCarousel
