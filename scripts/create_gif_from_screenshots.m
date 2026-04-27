#import <AppKit/AppKit.h>
#import <ImageIO/ImageIO.h>

static CGImageRef CreateScaledFrame(NSString *imagePath, CGSize targetSize) {
  NSImage *source = [[NSImage alloc] initWithContentsOfFile:imagePath];
  if (!source) {
    NSLog(@"Could not read image: %@", imagePath);
    return nil;
  }

  NSImage *canvas = [[NSImage alloc] initWithSize:NSMakeSize(targetSize.width, targetSize.height)];
  [canvas lockFocus];
  [[NSColor colorWithCalibratedRed:0.96 green:0.97 blue:0.99 alpha:1.0] setFill];
  NSRectFill(NSMakeRect(0, 0, targetSize.width, targetSize.height));
  [source drawInRect:NSMakeRect(0, 0, targetSize.width, targetSize.height)
            fromRect:NSZeroRect
           operation:NSCompositingOperationSourceOver
            fraction:1.0
      respectFlipped:NO
               hints:@{NSImageHintInterpolation: @(NSImageInterpolationHigh)}];
  [canvas unlockFocus];

  NSRect rect = NSMakeRect(0, 0, targetSize.width, targetSize.height);
  CGImageRef image = [canvas CGImageForProposedRect:&rect context:nil hints:nil];
  return CGImageRetain(image);
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc < 4) {
      NSLog(@"Usage: create_gif_from_screenshots output.gif frame1.png frame2.png ...");
      return 1;
    }

    NSString *outputPath = [NSString stringWithUTF8String:argv[1]];
    NSURL *outputURL = [NSURL fileURLWithPath:outputPath];
    [[NSFileManager defaultManager] createDirectoryAtURL:[outputURL URLByDeletingLastPathComponent]
                             withIntermediateDirectories:YES
                                              attributes:nil
                                                   error:nil];

    NSInteger frameCount = argc - 2;
    CGImageDestinationRef destination = CGImageDestinationCreateWithURL(
      (__bridge CFURLRef)outputURL,
      CFSTR("com.compuserve.gif"),
      frameCount,
      NULL
    );

    if (!destination) {
      NSLog(@"Could not create GIF destination");
      return 1;
    }

    NSDictionary *gifProperties = @{
      (__bridge NSString *)kCGImagePropertyGIFDictionary: @{
        (__bridge NSString *)kCGImagePropertyGIFLoopCount: @0
      }
    };
    CGImageDestinationSetProperties(destination, (__bridge CFDictionaryRef)gifProperties);

    CGSize targetSize = CGSizeMake(960, 667);
    for (int i = 2; i < argc; i++) {
      NSString *framePath = [NSString stringWithUTF8String:argv[i]];
      CGImageRef frame = CreateScaledFrame(framePath, targetSize);
      if (!frame) {
        CFRelease(destination);
        return 1;
      }

      NSDictionary *frameProperties = @{
        (__bridge NSString *)kCGImagePropertyGIFDictionary: @{
          (__bridge NSString *)kCGImagePropertyGIFDelayTime: i == argc - 1 ? @1.8 : @1.25
        }
      };
      CGImageDestinationAddImage(destination, frame, (__bridge CFDictionaryRef)frameProperties);
      CGImageRelease(frame);
    }

    BOOL ok = CGImageDestinationFinalize(destination);
    CFRelease(destination);

    if (!ok) {
      NSLog(@"Could not write GIF");
      return 1;
    }

    printf("%s\n", outputPath.UTF8String);
    return 0;
  }
}
