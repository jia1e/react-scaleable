import {
    forwardRef,
    HTMLAttributes,
    SetStateAction,
    useEffect,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { useEvent } from "react-use-event-hook";
import useSize from "@react-hook/size";

interface WheelOption {
    enabled?: boolean;
    factor?: number;
}

export interface ScaleableProps extends HTMLAttributes<HTMLDivElement> {
    defaultScale?: number;
    max?: number;
    min?: number;
    scale?: number;
    wheel?: WheelOption | boolean;
    onScale?(scale: (cur: number) => number): void;
}

type ScaleTo = (
    scale: number | ((cur: number) => number),
    origin?: { x: number; y: number }
) => void;

export type Position =
    | number
    | "start"
    | "end"
    | "center"
    | "content-start"
    | "content-end"
    | `${number}%`;

export interface ScrollToOption {
    left?: Position;
    top?: Position;
}

export interface ScaleableRef {
    scale: number;
    container: HTMLDivElement | null;
    scaleTo: ScaleTo;
    scaleEnded(): void;
    scrollTo(option: ScrollToOption): void;
}

export const Scaleable = forwardRef<ScaleableRef, ScaleableProps>(
    (
        {
            children,
            defaultScale = 1,
            scale,
            min = 0.1,
            max = 10,
            wheel = true,
            style,
            onScale,
            ...props
        },
        ref
    ) => {
        const container = useRef<HTMLDivElement>(null);
        const [containerWidth, containerHeight] = useSize(container);
        const wrapper = useRef<HTMLDivElement>(null);
        const [wrapperWidth, wrapperHeight] = useSize(wrapper);

        const { factor = 0.05, enabled: wheelEnabled = true } =
            typeof wheel === "boolean" ? { enabled: wheel } : wheel;

        const [scaleValue, setScaleValue] = useState(() =>
            typeof scale === "number" ? scale : defaultScale
        );

        const origin = useRef<{ x: number; y: number }>();
        const isScaledByWheel = useRef(false);
        const scrollBase = useRef<{
            left: number;
            top: number;
            scale: number;
        }>();

        const changeScaleValue = useEvent((value: SetStateAction<number>) => {
            if (!scrollBase.current) {
                scrollBase.current = {
                    left: container.current?.scrollLeft || 0,
                    top: container.current?.scrollTop || 0,
                    scale: scaleValue,
                };
            }
            setScaleValue(value);
        });

        const scaleTo = useEvent<ScaleTo>((value, orig = undefined) => {
            origin.current = orig || undefined;
            const modifier = (cur: number) => {
                const next = typeof value === "function" ? value(cur) : value;
                if (next > max) {
                    return max;
                }

                if (next < min) {
                    return min;
                }

                return next;
            };

            if (typeof onScale === "function") {
                onScale(modifier);
            }

            if (typeof scale !== "number") {
                changeScaleValue(modifier);
            }
        });

        const scaleEnded = useEvent(() => {
            isScaledByWheel.current = false;
            if (scrollBase.current) {
                scrollBase.current = undefined;
            }
        });

        const scrollTo = useEvent(({ left, top }: ScrollToOption = {}) => {
            if (container.current) {
                const { offsetHeight, offsetWidth, scrollHeight, scrollWidth } =
                    container.current;

                container.current.scrollTo({
                    top:
                        top &&
                        toNumeric(
                            top,
                            offsetHeight,
                            scrollHeight - 2 * offsetHeight,
                            offsetHeight,
                            scrollHeight
                        ),
                    left:
                        left &&
                        toNumeric(
                            left,
                            offsetWidth,
                            scrollWidth - 2 * offsetWidth,
                            offsetWidth,
                            scrollWidth
                        ),
                });
            }
        });

        useImperativeHandle(
            ref,
            () => {
                return {
                    container: container.current,
                    scale: scaleValue,
                    scaleTo,
                    scaleEnded,
                    scrollTo,
                };
            },
            [scaleValue, scaleTo, scaleEnded, scrollTo]
        );

        useLayoutEffect(() => {
            if (typeof scale === "number" && scale !== scaleValue) {
                changeScaleValue(scale);
            }
        }, [scale, scaleValue, changeScaleValue]);

        useEffect(() => {
            const c = container.current!;
            function onWheel(e: WheelEvent) {
                if (e.metaKey || e.ctrlKey) {
                    e.preventDefault();
                    const { clientX, clientY, deltaY } = e;
                    const { left, top } = c.getBoundingClientRect();
                    if (!isScaledByWheel.current) {
                        scrollBase.current = undefined;
                        isScaledByWheel.current = true;
                    }
                    scaleTo((prev) => prev - deltaY * factor, {
                        x: clientX - left,
                        y: clientY - top,
                    });
                } else {
                    scaleEnded();
                }
            }

            function onMouseMove() {
                if (isScaledByWheel.current === true) {
                    scaleEnded();
                }
            }

            if (wheelEnabled) {
                c.addEventListener("wheel", onWheel);
                window.addEventListener("mousemove", onMouseMove);

                return () => {
                    c.removeEventListener("wheel", onWheel);
                    window.removeEventListener("mousemove", onMouseMove);
                };
            }
        }, [scaleTo, scaleEnded, factor, wheelEnabled]);

        useEffect(() => {
            if (container.current && scrollBase.current) {
                const { offsetWidth, offsetHeight } = container.current;
                const { x = offsetWidth / 2, y = offsetHeight / 2 } =
                    origin.current || {};
                const { top, left, scale: lastScaleValue } = scrollBase.current;

                container.current.scrollTo({
                    left:
                        left +
                        ((left + x - offsetWidth) *
                            (scaleValue - lastScaleValue)) /
                            lastScaleValue,
                    top:
                        top +
                        ((top + y - offsetHeight) *
                            (scaleValue - lastScaleValue)) /
                            lastScaleValue,
                });
            }
        }, [scaleValue]);

        return (
            <div
                {...props}
                style={{ ...style, overflow: "auto" }}
                ref={container}
            >
                <div
                    style={{
                        position: "relative",
                        width: scaleValue * wrapperWidth,
                        height: scaleValue * wrapperHeight,
                        paddingTop: containerHeight,
                        paddingBottom: containerHeight,
                        paddingLeft: containerWidth,
                        paddingRight: containerWidth,
                        overflow: "hidden",
                        boxSizing: "content-box",
                    }}
                >
                    <div
                        ref={wrapper}
                        style={{
                            display: "table-cell",
                            transform: `scale(${scaleValue})`,
                            transformOrigin: "top left",
                        }}
                    >
                        {children}
                    </div>
                </div>
            </div>
        );
    }
);

function toNumeric(
    pos: Position,
    viewport: number,
    contentLength: number,
    padStart: number,
    scrollLength: number
) {
    if (typeof pos === "number") {
        return pos;
    }

    if (pos.endsWith("%")) {
        const percent = parseFloat(pos);
        if (isNaN(percent)) {
            return;
        }

        return (percent / 100) * scrollLength;
    }

    switch (pos) {
        case "start":
            return 0;
        case "end":
            return scrollLength - viewport;
        case "center":
            return (scrollLength - viewport) / 2;
        case "content-start":
            return padStart;
        case "content-end":
            return padStart + contentLength - viewport;
    }
}
